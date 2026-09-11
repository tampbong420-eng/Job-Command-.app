# Job Command

Field-ops dashboard for Job Command. Both **Boss** and **Employee** roles share
the same shop: crew, jobs, estimates, time cards, and settings persist in the
browser.

Boss Command is the dispatch desk:

- **CREW** rolodex with live hours, clock status, and weekly schedule
- **Edit Hours** calendar for each crew member
- Combination-lock job tumbler that cycles **active jobs only**
- **Get Directions** opens Street View and Google Maps
- Live Google Map on the crew desk
- Semantic job colors: new leads red, pending orange/yellow, active light green, finished charcoal
- Customer cards with **New lead / Pending / Active / Finished / Delete**
- **Add customer** form plus Cards / Estimates / Time cards tabs
- **AI Talk** on every page for status, estimates, time cards, and new leads

Employee Command is the field side of the same shop:

- Orange **Clocked Out** / green **Clocked In** tile wired to the shared crew roster
- Assigned job with **Get Directions**
- On-clock crew Call list
- **My Stops** board (jobs locked to that employee)
- Profile identity picker so the phone can clock in as Mike, Dana, Sam, or Liv
- Settings for shop name, account chip, page alerts, and **Reset demo shop**

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Switch **EMPLOYEE** /
**BOSS** in the top bar.
