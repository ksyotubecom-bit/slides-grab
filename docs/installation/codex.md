# Codex Setup And Usage

This guide is for running `ppt-team-agent` with Codex and repo-local Codex skills.

## 1) Install Dependencies

Clone:

```bash
git clone https://github.com/vkehfdl1/ppt_team_agent.git && cd ppt_team_agent
```

Install (macOS):

```bash
brew update && brew install node git && npm ci && npx playwright install chromium
```

Install (Ubuntu):

```bash
sudo apt-get update && sudo apt-get install -y curl git && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs && npm ci && npx playwright install chromium
```

Install (Windows PowerShell):

```powershell
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements; winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements; npm ci; npx playwright install chromium
```

Verify:

```bash
npm exec -- ppt-agent --help
```

## 2) Install Codex Skills

Install project skills into `~/.codex/skills`:

```bash
ppt-agent install-codex-skills --force
```

Alternative:

```bash
node scripts/install-codex-skills.js --force
```

Then restart Codex so skills are loaded.

## 3) Codex Workflow

Codex skill references:

- `skills/ppt-plan-skill/SKILL.md`
- `skills/ppt-design-skill/SKILL.md`
- `skills/ppt-pptx-skill/SKILL.md`

Run one deck per workspace folder:

```bash
ppt-agent edit --slides-dir decks/my-deck
ppt-agent build-viewer --slides-dir decks/my-deck
ppt-agent validate --slides-dir decks/my-deck
ppt-agent pdf --slides-dir decks/my-deck --output decks/my-deck.pdf
ppt-agent convert --slides-dir decks/my-deck --output decks/my-deck.pptx
```

## 4) Recommended Codex Kickoff Prompt

Copy-paste into Codex:

```text
Read docs/installation/codex.md first and follow it exactly. Use Codex skills (ppt-plan-skill, ppt-design-skill, ppt-pptx-skill), keep each deck in decks/<deck-name>, and run validate before convert/pdf.
```
