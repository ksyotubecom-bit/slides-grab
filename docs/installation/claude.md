# Claude Setup And Usage

This guide is for running `ppt-team-agent` with Claude-based workflow files under `.claude/skills/`.

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

## 2) Claude Skill Workflow

Use the 3-stage workflow in `.claude/skills/`:

1. Planning stage
2. Design stage
3. Conversion stage

Core references:

- `.claude/skills/plan-skill/SKILL.md`
- `.claude/skills/design-skill/SKILL.md`
- `.claude/skills/pptx-skill/SKILL.md`

## 3) Run Commands During Workflow

Use one workspace folder per deck:

```bash
ppt-agent edit --slides-dir decks/my-deck
ppt-agent build-viewer --slides-dir decks/my-deck
ppt-agent validate --slides-dir decks/my-deck
ppt-agent pdf --slides-dir decks/my-deck --output decks/my-deck.pdf
ppt-agent convert --slides-dir decks/my-deck --output decks/my-deck.pptx
```

## 4) Recommended Claude Kickoff Prompt

Copy-paste into Claude:

```text
Read docs/installation/claude.md first and follow it exactly. Use the 3-stage Claude skills workflow (.claude/skills/plan-skill, design-skill, pptx-skill). Use decks/<deck-name> as the slides workspace and run validate before conversion.
```
