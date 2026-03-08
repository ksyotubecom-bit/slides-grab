# Setup

Copy-paste installation guide for `ppt-team-agent`.

## 1) Clone the Repository

```bash
git clone https://github.com/vkehfdl1/ppt_team_agent.git && cd ppt_team_agent
```

## 2) One-Liner Install by OS

macOS (Homebrew):

```bash
brew update && brew install node git && npm ci && npx playwright install chromium
```

Ubuntu (apt):

```bash
sudo apt-get update && sudo apt-get install -y curl git && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs && npm ci && npx playwright install chromium
```

Windows (winget, PowerShell):

```powershell
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements; winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements; npm ci; npx playwright install chromium
```

## 3) Verify CLI

```bash
npm exec -- ppt-agent --help
```
