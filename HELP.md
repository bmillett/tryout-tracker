# Tryout Tracker: Help Guide

Tryout Tracker is a sideline app for scoring players during team tryouts. Evaluators rate players on a phone. Coaches see the combined results and build the roster.

This guide has two parts:

- **[For evaluators](#for-evaluators)**: opening the app, finding players, scoring them, and adding notes.
- **[For coaches and admins](#for-coaches-and-admins)**: the Roster Board, managing players and criteria, running sessions, and settings.

A short **[for super-admins](#for-super-admins-creating-and-managing-teams)** section covers creating teams.

---

## Getting started

### Open your team's link

Each team has its own link, which looks like this:

```
https://<your-app>.vercel.app/t/<team-name>
```

Ask your coach for the link. Open it in your phone's browser, or bookmark it. Every evaluator and coach on the team uses the same link.

### Enter your name

The first time you open the link, the app asks for your name or initials (for example "Coach Alex" or "Sarah T."). Your scores and notes are saved under this name, so use the same name each time and make sure it is different from the other evaluators.

The name is remembered on that device. To switch to a different name, tap the **exit icon** (top right). This also locks the coach screens.

### Save the link to your home screen or bookmarks

The most reliable way to keep quick access to your team's link is to **bookmark it** in your phone's browser. A bookmark always opens the exact team URL.

**iPhone / iPad (Safari):** tap the **Share** button → **Add Bookmark**, or **Add to Favourites**.

**Android (Chrome):** tap the **three-dot menu** → **Add to bookmarks** (or **Bookmarks → Save**).

You can also add the app to your home screen for a full-screen experience, but be aware of one limitation: the home-screen shortcut always opens the app's root address (`/`), not your team's specific link. That means tapping it will land on a "team not found" screen until you navigate to your team link again. For that reason, **bookmarking is the better choice for most evaluators**, especially if you work with more than one team.

If you still want a home-screen icon:

**iPhone / iPad (Safari):** tap **Share** → scroll down → **Add to Home Screen** → **Add**.

**Android (Chrome):** tap the **three-dot menu** → **Install App** or **Add to Home Screen** → **Install / Add**.

### Works offline

Scores are saved on your device first, then sent to the cloud when you have a connection. If the signal drops, keep scoring. The badge at the top shows your status:

| Badge | Meaning |
|---|---|
| **Cloud Live** (green) | Online and syncing |
| **Offline (Saving locally)** (amber) | No connection. Everything is stored on your device |
| **Syncing...** | Sending changes now |
| **N queued** | Changes waiting to be sent |

Once a team has loaded on a device, it opens even without a connection.

### Light and dark mode

Tap the **sun/moon icon** at the top to switch.

---

## For evaluators

### The player grid

After you enter your name you see a grid of player cards. Each card shows:

- **Jersey number**, shown in the color of the player's pinney.
- **Name**: first name and last initial by default (for example "Kian M.").
- **Group**: the drill or field group.
- **Pinney color** name.
- **Your progress**: "Not rated yet", "5/16 rated", or "Rated (16/16)" once you have scored everything.
- **Status tags** where relevant: *No need to watch*, *Injured*, or *Absent*. These cards are faded.

Players the coaches have marked **Cut / Moved Down** do not appear.

### Finding players

- **Search box**: type a name or a jersey number.
- **Group pills**: tap a group to show only that group, or **All**.
- **Full Names**: shows full names on the cards instead of first name and last initial. This is saved on your device.
- **Unrated Only**: hides players you have finished scoring, so you can see who is left.
- **M / F buttons** (mixed-gender teams only): tap to hide or show that gender. At least one stays on.

### Scoring a player

Tap a card to open the scoring sheet. At the top you see the player's number, name and group. Use the **arrows** to move to the previous or next player in your current list, and the **X** to close.

The sheet has four tabs:

| Tab | What it holds |
|---|---|
| **Offense** | Offensive skills |
| **Defense** | Defensive skills |
| **Athleticism & Intangibles** | Speed, conditioning, spirit, composure |
| **Notes** | Quick notes and comments |

Each tab shows a count like **3/6** of skills you have rated.

For each skill, tap one of five buttons:

| Button | Meaning |
|---|---|
| **--** | Novice |
| **-** | Below standard |
| **Std** | Standard |
| **+** | Above standard |
| **++** | Expert |

The chosen button turns amber and shows **× clear**. Tap a different button to change your score, or tap the same button again to remove the rating entirely. A skill may show an **e.g. Name** tag, which is an exemplar: a player who is the benchmark for that skill. The small description under the skill name tells you what to look for.

The bottom bar shows how many skills you have graded in total. Tap **Done** to close.

### Adding notes

Open the **Notes** tab for a player.

- **Preset chips**: one tap adds a note such as *Lock for team*, *Standout performer*, *Bubble contender*, *Lockdown defender*, *Struggles with turnovers*, or *Cut / Move down to Dev team*.
- **Custom note**: type a comment and tap the send button.

The list under "My Notes" shows your notes for that player. Coaches can see every evaluator's notes.

### When a session is frozen

If a coach freezes the session, a banner says it is finalized (read-only). You can still look at players but you can't change scores or add notes.

---

## For coaches and admins

Coach screens are protected by the team's **Coach PIN**. Tap **Roster Board** or **Settings** (both show a padlock) and enter the PIN on the keypad. It unlocks both screens until you close the browser tab or tap the exit icon.

Ask your super-admin if you don't know the PIN, or use [Change Coach PIN](#change-coach-pin) once you are in.

### Roster Board

The Roster Board shows the combined scores from all evaluators and is where you lock players onto the team.

**Header**

- **Spots locked**: for example "14 of 22 Spots Locked", with the number of open spots and a progress bar.
- **M / F counts** (mixed-gender teams).
- **Freeze Evaluator Inputs**: stops all evaluators from scoring or adding notes. Use it when scoring is done for the session. Tap **Re-Open Inputs** to allow scoring again.
- **Export CSV Matrix**: downloads a spreadsheet of the players currently shown (see [Exporting](#exporting-results)).

**Finding and sorting**

- Search by name or jersey number, and filter by group.
- **Sort by**: Overall Rank, Offense, Defense, Intangibles, or Jersey #.
- Locked players stay at the top when sorting by Overall Rank.

**The table**

| Column | What it shows |
|---|---|
| **Rank** | Position in the current sort. Locked rows have an amber tint, and rows beyond your target roster size are dimmed |
| **Player** | Pinney color, number, name, and a *Locked* tag |
| **Group** | The player's group |
| **Overall** | Average of all scores, color-coded: green 4+, blue 3+, amber 2+, red below 2 |
| **Offense / Defense** | Category averages (wider screens) |
| **Evaluators** | How many evaluators scored the player and how many scores in total |
| **Lock Spot** | Padlock button. Tap to lock the player onto the team, tap again to unlock |
| **Details → Inspect** | Opens the player's notes from every evaluator and the average score for each skill |

Scores are on a 1 to 5 scale (-- = 1, Std = 3, ++ = 5). Players marked Cut / Moved Down are hidden.

### Settings

Tap **Settings** to open the admin screen. At the top you see the current session, its status (**Live** or **Frozen**), the target roster size and how many players are locked. You can switch session from the drop-down, or use **Freeze Evaluator Inputs** / **Re-Open Inputs** (the same toggle as on the Roster Board).

There are four tabs.

#### Roster & Pinneys

**Add one player.** Enter the name, pinney color and group (and gender for mixed-gender teams), then tap **Add Player to Roster**. The jersey number is optional. A player without one shows **--** in place of the number.

**Upload a roster (CSV).** Tap **Select CSV File** and choose a `.csv` file with a header row and these columns:

| Column | Notes |
|---|---|
| `Name` | Player name |
| `Number` | Jersey number. Optional. Blank shows as `--` |
| `PinneyColor` | Optional. For a new player, blank or unrecognized becomes N/A |
| `Group` | Optional. For a new player, blank becomes "Group A" |
| `Gender` | Mixed-gender teams only. M, Male, Men, Man, Boy, F, Female, Women, Woman, Girl (any case) |

Column headers are not case-sensitive, and spaces, underscores and hyphens are ignored, so `Pinney Color`, `pinney_color` and `PinneyColor` all work. `Color` also works as the color column name, `Jersey` or `#` for the number, and `Player` for the name. You can also use `First Name` and `Last Name` columns instead of `Name`.

Example:

```
Name,Number,PinneyColor,Group
Kian Miller,7,Blue,Group A
Maya Singh,22,White,Group B
```

**Re-importing updates existing players.** A CSV row whose name matches a player already in the current session (ignoring upper/lower case) updates that player instead of adding a new one. This makes it easy to re-upload a roster after pinney colors change. The match is on name only.

- Each of number, pinney color and group is replaced only when the row has a value for it. A blank cell (or a missing column) keeps the player's current value. This lets you import colors first and the numbers later, or the reverse, without wiping the other.
- Color names are not case-sensitive, and spaces around the `/` are optional. `Yellow` or `Gold` is read as Yellow / Gold, `Blue`, `Navy`, `Blue/Navy` or the older `Navy / Blue` as Blue / Navy, and `Pink` or `Purple` as Pink / Purple.
- A color name the app doesn't recognize is treated as a value and sets the color to N/A. Check spelling if a color goes grey.
- A new player whose row has no number shows `--`.
- Gender is updated only when the row has a gender value.
- Status, lock and all scores and notes are kept.
- Rows with a name not yet in the session are added as new players.
- If two players share a name, they are treated as one. Give them distinct names (for example, add an initial) before importing.

When the import finishes, a message shows how many players were added and how many were updated.

**Edit players.** The table lists every player. Change these directly:

- **Number**: click, edit, then press Enter or click away. Press Esc to cancel. Only whole numbers of 0 or more are accepted. Clear the field to remove the number (shown as `--`).
- **Name**: click, edit, then press Enter or click away. Press Esc to cancel.
- **Pinney Color**: pick from the list.
- **Group**: type a new group name.
- **Gender**: mixed-gender teams only.
- **Status**: see below.
- **Team Lock**: the padlock locks or unlocks the player, same as on the Roster Board.
- **Trash can**: deletes the player from this session. You will be asked to confirm.

**Player status**

| Status | Effect |
|---|---|
| **Active** | Normal |
| **No Need to Watch** | Card is faded and tagged. Carries into the next session as is |
| **Injured** | Card is faded and tagged |
| **Absent** | Card is faded and tagged |
| **Cut / Moved Down** | Hidden from evaluators and the Roster Board. Not carried into the next session |

**Pinney colors available:** Red, Blue, White, Black, Green, Yellow / Gold, Orange, Pink / Purple, and **N/A** (grey). Use N/A when a player has no pinney color yet. The color only changes how the number badge looks.

#### Criteria & Exemplars

Criteria are the skills evaluators score. Each belongs to one of three categories: **Offense**, **Defense**, or **Athleticism & Intangibles**. A new team starts with 16 skills (6 offense, 6 defense, 4 athleticism and intangibles).

- **Add a criterion**: enter a skill name, choose a category, optionally an **exemplar** (a player who shows the benchmark), and a short description of what evaluators should look for. Tap **Add Criterion**.
- **Edit**: tap the pencil to change the name, category or description, then **Save**.
- **Exemplar**: type a player's name in the small box on any criterion. It saves as you type and shows to evaluators as "e.g. Name".
- **Delete**: tap the trash can and confirm.

> Add or change criteria before scoring starts. Deleting a criterion removes it from the scoring sheet and the per-skill breakdown, but scores already given for it may still count towards a player's Overall average.

#### Multi-Session Rollover

Use this to move from one tryout day to the next (Session 1 → Session 2 → Session 3).

1. Enter a **New Session Name** (for example "Session 2 - Callbacks").
2. Set the **Session Number**.
3. Choose the **Source Session** to copy from.
4. Tick **Only carry over Locked players** if you want just the locked players. Leave it unticked to carry over everyone who isn't Cut / Moved Down.
5. Tap **Create Session & Carry Over Roster**.

The new session starts with the source session's criteria (including exemplars) and players. Players come across as **Active**, except those marked *No Need to Watch*. Scores and notes start fresh. The new session uses the same target roster size, and the app switches to it. Earlier sessions stay available in the session drop-down.

#### Cloud & Security (Settings)

The tab labelled **Cloud & Security** holds team-wide settings.

##### Target roster size

The number of spots to fill on the final roster (default 22). It drives the spot counter and progress bar on the Roster Board. Change the number and click away or press Enter. It applies to the current session, and new sessions copy it. It must be a whole number of 1 or more.

##### Change Coach PIN

1. Enter a new PIN of **4 to 8 digits**.
2. Enter it again to confirm.
3. Tap **Update PIN**.

The page reloads and the new PIN is used straight away on this device. Other devices pick up the new PIN the next time they load the team while online, so until then they may still accept the old one.

> **Security note:** anyone who knows a team's link can change its PIN, and the PIN is stored where anyone with the link could read it. The PIN keeps casual users out of coach screens. It does not protect against someone determined. Keep team links private. If a PIN is changed by mistake, a super-admin can reset it.

##### Evaluators

Lists every evaluator who has submitted scores in the current session, along with their score count. Tap the **trash icon** next to a name to remove all that evaluator's scores and notes from this session. Use this to clean up a duplicate or wrongly-named evaluator profile. The removal syncs to all connected devices.

##### Cloud Sync

Information only. All devices using the same team link sync automatically, with no setup.

### Typical tryout workflow

1. **Before tryouts:** set the coach PIN, target roster size and criteria. Upload the roster by CSV. Give each evaluator the team link.
2. **During tryouts:** evaluators score players and add notes from their phones. Coaches watch the Roster Board fill in.
3. **After each session:** lock the players you want to keep, mark cuts as *Cut / Moved Down*, then **Freeze Evaluator Inputs**.
4. **Next session:** use **Multi-Session Rollover** to create the next session with the right players.
5. **At the end:** export the CSV matrix for your records and finalize the session.

### Exporting results

On the Roster Board, tap **Export CSV Matrix**. The file includes only the players currently shown, so clear the search and set the group filter to **All** to export everyone. Players marked Cut / Moved Down are never included.

Columns: Jersey # (blank for a player with no number), Name, Pinney Color, Group, Status, Locked, Overall / Offense / Defense / Intangibles averages (1 to 5), Total Evals, Evaluators Count, Preset Tags, and Coach Notes (each prefixed with the evaluator's name). Mixed-gender teams also get a Gender column.

The file is named `<team>_Tryout_<session>_Matrix.csv`.

---

## For super-admins: creating and managing teams

Team setup happens on the app's **root address** (`https://<your-app>.vercel.app/`), not on a team link. Open it in a normal browser tab, not the installed app.

1. Enter the **super-admin PIN**. This is the `SUPER_ADMIN_PIN` secret set on the server, and it is different from any team's coach PIN.
2. You see a list of all teams. Each team has a copy-link button, an edit pencil, and an expand arrow.

**Create a team**

- **Slug**: the short name in the team link. Lowercase letters, digits and hyphens, 2 to 40 characters, starting with a letter or digit. It cannot be changed later. `api`, `t`, `admin` and `assets` are reserved.
- **Team name**: shown in the app.
- **Coach PIN**: 4 to 8 digits.
- **Mixed-gender team**: turn on to show M/F badges, gender filters and counts, and the Gender column in the roster tools and export.

**Edit a team**: change the name, the coach PIN or the mixed-gender setting. This is also how you reset a PIN that a coach has forgotten or changed by mistake.

Server setup (environment variables, Firestore rules and deployment) is covered in the [README](README.md).

---

## Troubleshooting

| Problem | What to try |
|---|---|
| "Team not found" | Check the link. Ask your coach for the right one |
| "Can't load team" | You are offline and have never loaded this team on this device. Connect once and reload |
| Wrong or forgotten coach PIN | Another device may still have the old PIN until it reloads online. Otherwise ask the super-admin to reset it |
| My scores don't show for the coaches | Check the badge. If it says Offline or "queued", they will arrive when you reconnect |
| I can't change scores | The session is frozen or finalized. A coach can re-open it |
| A player is missing | They may be marked Cut / Moved Down, or a filter (group, gender, Unrated Only, search) is hiding them |
| Two evaluators' scores are mixed together | Both used the same name. Each evaluator needs a unique name. Use the exit icon to switch |
| Pink and Purple players now say "Pink / Purple" | These two colors were combined. Teal was removed, and players with a missing color show as N/A |
