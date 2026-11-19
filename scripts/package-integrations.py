#!/usr/bin/env python3
"""Build deterministic, inspected host archives using only the Python standard library."""
import hashlib, json, re, struct, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
TARGETS = {
    "orbitali-openai-desktop-0.2.1": "openai",
    "orbitali-openai-submission-0.2.1": "openai-submission/orbitali",
    "orbitali-claude-marketplace-0.2.1": "claude",
    "orbitali-gemini-extension-0.2.1": "gemini/orbitali",
}
SECRET = re.compile(rb"(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|orb_(?:oat|ort|mi|sk)_[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)")
def inspect(files):
    assert files, "Empty package"
    for name, data in files.items():
        path = Path(name)
        assert not path.is_absolute() and ".." not in path.parts
        assert not any(p in {".git", "node_modules", ".env", "__pycache__"} or p.startswith(".env.") for p in path.parts)
        assert not SECRET.search(data), f"Credential pattern in {name}"
        if name.endswith(".json"):
            doc = json.loads(data)
            servers = doc.get("mcpServers", {})
            for server in servers.values():
                assert server.get("url", server.get("httpUrl")) == "https://mcp.orbitali.ai/mcp"
                assert "headers" not in server
                if "extensions" in server:
                    assert server["extensions"] == {"com.openai": {"auth": {"type": "oauth", "client": {"mode": "cimd"}}}}
                    assert set(server) == {"type", "url", "extensions"}
            if name.endswith("plugin.json") and "extensions" in doc:
                ext = doc["extensions"]["com.openai"]
                assert len(ext["review"]["test_cases"]["positive"]) == 5
                assert len(ext["review"]["test_cases"]["negative"]) == 3
                assert doc["name"] == "orbitali" and doc["version"] == "0.2.1"
                for key in ["logo", "logoDark", "composerIcon", "composerIconDark"]:
                    image = str(path.parent / ext["interface"][key])
                    assert image in files, f"Missing icon {image}"
        if name.endswith(".png"):
            assert data[:8] == b"\x89PNG\r\n\x1a\n"
            assert struct.unpack(">II", data[16:24]) == (512, 512)
OUT.mkdir(exist_ok=True)
checksums = []
for name, source in TARGETS.items():
    base = ROOT / "integrations" / source
    paths = sorted(p for p in base.rglob("*") if p.is_file())
    assert not any(p.is_symlink() for p in base.rglob("*"))
    # Reject environment files before reading their contents into an archive.
    assert not any(part == ".env" or part.startswith(".env.") for p in paths for part in p.relative_to(base).parts), "Environment file in package source"
    files = {p.relative_to(base).as_posix(): p.read_bytes() for p in paths}
    inspect(files)
    archive = OUT / (name + ".zip")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for relative, data in files.items():
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data, compresslevel=9)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        inspect({n: z.read(n) for n in z.namelist()})
        assert z.namelist() == list(files)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksums.append(f"{digest}  {archive.name}")
    print(f"{archive.name}: {len(files)} files, inspected")
(OUT / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
