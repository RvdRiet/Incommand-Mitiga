# Code-signing the Windows desktop app

Unsigned, the app trips **SmartScreen** ("Windows protected your PC") and, on locked-
down machines, **Application Control** blocks it outright — exactly what you saw. Signing
fixes both and is required for real distribution. Signing needs a **code-signing
certificate**; the tooling here is ready — you supply the cert, then it's one command.

## Which certificate (pick one)

| Option | Cost | SmartScreen reputation | Notes |
| --- | --- | --- | --- |
| **Azure Trusted Signing** (recommended) | ~US$10/mo | Good, quickly | Cloud signing, **no hardware token**, org identity verification. Modern default. |
| **EV code-signing cert** | ~US$300–700/yr | **Instant** | On a hardware token/HSM. Best if you want zero SmartScreen friction on day one. |
| **OV code-signing cert** | ~US$200–400/yr | Builds over time | Now also requires a hardware token/HSM (CA/B rules). |

For an org distributing an incident-command tool, **Azure Trusted Signing** or an **EV**
cert are the pragmatic choices.

## Signing a build

```bash
npm run electron:pack            # produce dist-electron/InCommand-win32-x64/
# then, with a cert configured (see below):
npm run electron:sign            # signs + timestamps + verifies InCommand.exe
# or do both at once:
npm run electron:dist
```

### With a .pfx file (OV/EV exported, or a test cert)
```bash
export WIN_CSC_LINK="C:/secure/incommand-codesign.pfx"
export WIN_CSC_KEY_PASSWORD="••••••"
npm run electron:sign
```

### With a cert already in the Windows certificate store
```bash
export WIN_CERT_THUMBPRINT="A1B2C3…"   # certmgr → the cert's thumbprint (no spaces)
npm run electron:sign
```

Requires **signtool.exe** (Windows SDK → "Signing Tools for Desktop Apps"). The script
finds it automatically; the timestamp server defaults to DigiCert (override with
`WIN_TIMESTAMP_URL`).

### Azure Trusted Signing
Trusted Signing signs via its own tool rather than a local key. After creating a Trusted
Signing account + certificate profile and installing `azuresigntool`:
```bash
azuresigntool sign -kvu <endpoint> -kvc <cert-profile> -kvm \
  -tr http://timestamp.acs.microsoft.com -td sha256 -fd sha256 \
  "dist-electron/InCommand-win32-x64/InCommand.exe"
```
(CI is the natural home for this — keep signing credentials in the pipeline, not on dev boxes.)

## Building a signed installer
`npm run electron:build` (electron-builder → NSIS) auto-signs when `CSC_LINK` /
`CSC_KEY_PASSWORD` (or Azure) env is set. Note: on Windows without Developer Mode, the
electron-builder installer path can fail extracting its `winCodeSign` bundle (symlinks) —
run it in **CI** or a Developer-Mode machine, or ship the signed **packaged folder**
(`electron:dist`) zipped.

## Verify a signed exe
```bash
signtool verify /pa /v "dist-electron/InCommand-win32-x64/InCommand.exe"
# or: right-click the exe → Properties → Digital Signatures
```
