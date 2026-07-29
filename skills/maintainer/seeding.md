# CommonGround — Guided Seeding Questions

> Generated from `@commonground/shared/seeding` — the single source of truth shared with
> in-app (Model B) seeding. Do NOT edit by hand; regenerate with the maintainer-skill's
> `generate` script so the interview never drifts from the app.

## Discipline: pm

Seed the product context your team's LLMs should always start from.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **What are the current priorities and roadmap themes?**
   → seeds `company/roadmap` — *Roadmap* (type `concept`, scope `company`)
4. **Who are your primary users or customers?**
   → seeds `company/personas` — *Personas* (type `entity`, scope `company`)
5. **How do you measure success — the key metrics that matter?**
   → seeds `company/success-metrics` — *Success Metrics* (type `concept`, scope `company`)

## Discipline: dev

Seed the engineering context your team and its coding tools should share.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **What is your core tech stack, and why those choices?**
   → seeds `company/tech-stack` — *Tech Stack* (type `entity`, scope `company`)
4. **Describe the high-level system architecture.**
   → seeds `company/architecture` — *Architecture* (type `concept`, scope `company`)
5. **What engineering conventions and standards does the team follow?**
   → seeds `company/engineering-conventions` — *Engineering Conventions* (type `concept`, scope `company`)

## Discipline: design

Seed the design context that keeps work consistent.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **What design principles guide your work?**
   → seeds `company/design-principles` — *Design Principles* (type `concept`, scope `company`)
4. **Who are you designing for — the key user personas?**
   → seeds `company/personas` — *Personas* (type `entity`, scope `company`)
5. **Describe your design system or component library.**
   → seeds `company/design-system` — *Design System* (type `entity`, scope `company`)

## Discipline: qa

Seed the quality context — how the team tests and what "done" means.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **What is your testing strategy — levels, tools, coverage expectations?**
   → seeds `company/qa-strategy` — *QA Strategy* (type `concept`, scope `company`)
4. **What does "done" / acceptance look like for your team?**
   → seeds `company/acceptance-criteria` — *Acceptance Criteria* (type `concept`, scope `company`)
5. **What are the top quality risks or areas to watch?**
   → seeds `company/quality-risks` — *Quality Risks* (type `concept`, scope `company`)

## Discipline: exec

Seed the strategic context that frames every decision.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **What is the long-term vision?**
   → seeds `company/vision` — *Vision* (type `concept`, scope `company`)
4. **What are the current strategic objectives or OKRs?**
   → seeds `company/objectives` — *Objectives* (type `concept`, scope `company`)
5. **Describe the team/org structure and the key roles.**
   → seeds `company/org-structure` — *Org Structure* (type `entity`, scope `company`)

## Discipline: other

Seed the shared context everyone on the team should start from.

1. **What is your team's mission — the durable reason you exist?**
   → seeds `company/mission` — *Mission* (type `concept`, scope `company`)
2. **List the key terms and acronyms your team uses, and what each means.**
   → seeds `company/glossary` — *Glossary* (type `concept`, scope `company`)
3. **Give a high-level overview of what your team does.**
   → seeds `company/overview` — *Overview* (type `concept`, scope `company`)
4. **What are your team's current goals?**
   → seeds `company/goals` — *Goals* (type `concept`, scope `company`)
5. **What key resources or links should everyone know?**
   → seeds `company/resources` — *Resources* (type `concept`, scope `company`)

## Audience: just-me

Use this set INSTEAD of the discipline sets when the charter audience is `just-me`. A personal
wiki is not a team of one — opening by asking a solo user for their team mission and a shared
glossary is the fastest way to feel misunderstood.

A personal wiki — the context you would otherwise repeat to every new session. Answer in your own words; anything you skip can be added later.

1. **Who are you, and how do you work? The context you would otherwise re-explain to every new tool — role, how you like to work, what you are good at.**
   → seeds `company/about-me` — *About me* (type `concept`, scope `company`)
2. **What are you actually working on right now? Projects, clients, side things — one line each on what it is and where it stands.**
   → seeds `company/projects` — *Projects* (type `entity`, scope `company`)
3. **What choices and preferences do you not want to re-explain? How you like things written, structured, or decided.**
   → seeds `company/preferences` — *Decisions & preferences* (type `decision`, scope `company`)
4. **What tools and setup do you use? So an answer assumes the right environment instead of a generic one.**
   → seeds `company/stack` — *Tools & stack* (type `concept`, scope `company`)
5. **How do you write? Paste a short piece of your own writing, or describe the voice you want things drafted in.**
   → seeds `company/voice` — *Writing voice* (type `concept`, scope `company`)
