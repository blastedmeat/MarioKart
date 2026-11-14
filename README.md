# Kart Race Control

Tournament scheduler, scoreboard and TV display for a 3-TV Mario Kart 8 Deluxe night.

- **Phone / laptop:** `your-site.vercel.app` — check-ins, results entry, standings, finals
- **TV screen:** `your-site.vercel.app/tv` — full-screen, read-only, updates live
- **Test mode:** add `?mode=test` to either link (`/?mode=test`, `/?mode=test#tv`). Separate data; never touches the live event.

Everyone can view. Only someone with the organizer PIN can edit.

---

## One-time setup (about 30–45 minutes)

### 1. Create the database (Supabase, free)
1. Go to supabase.com, sign up, click **New project**. Any name, any region near you, save the database password somewhere. Wait for it to finish (~2 min).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `supabase/setup.sql` from this folder, copy all of it, paste it in.
4. On the line marked `<<< your organizer PIN`, replace `CHANGE-ME` with your PIN. Use a short phrase, not 4 digits.
5. Click **Run**. You should see "Success. No rows returned."
6. Left sidebar → **Project Settings** → **API**. Copy the **Project URL** and the **anon public** key.

### 2. Connect the site to the database
Open `config.js` in Notepad and paste the two values between the quotes:

```js
window.KART_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."
};
```

The anon key is meant to be public. It can only read results; edits require the PIN.

### 3. Put it online (Vercel)
**Option A — GitHub (same as your other apps)**
1. On github.com, create a new repository named `kart-race-control`.
2. Click **uploading an existing file**, drag in everything from this folder (including the `supabase` folder), and commit.
3. On vercel.com → **Add New → Project** → import `kart-race-control` → **Deploy**. No settings to change.

**Option B — from PowerShell, no GitHub**
```powershell
cd path\to\kart-race-control
npx vercel --prod
```
Answer the prompts with the defaults.

---

## Test it (do this a day or two before)
1. Open `your-site.vercel.app/?mode=test` on your phone.
2. **Setup** tab → enter your PIN → **Unlock**.
3. **Setup** → **Load 15 sample players**, then **Simulate 8 rounds**.
4. On a laptop, open `your-site.vercel.app/?mode=test#tv`. Click **Full screen**.
5. On your phone, start a round and enter a few places. The TV should update within a couple of seconds and play the start lights.
6. Try the finals: **Finals** → **Seed top 6**, then **Setup** → **Auto-fill finals cup**, then **Cut 2 and start cup 2**, and so on to the podium (6 race one elimination cup, then the final 4 race 2 cups).
7. When done: **Setup** → **Erase everything** (this only clears test data).

## Event day
- TV laptop: open `your-site.vercel.app/tv`, click **Full screen**. Leave it.
- Your phone: open `your-site.vercel.app`, **Setup** → PIN → **Unlock**. A second helper can unlock on their phone too; simultaneous edits are merged.
- Players can open `your-site.vercel.app` on their own phones to follow along (read-only).

## Safety net
- **Backups:** every save keeps the previous version (last 50). **Setup → Backups → Show backups → Restore** rolls back a mistake.
- **Reset:** **Setup → Reset** clears results (keeps roster) or erases everything. Applies only to the mode you're in (live or test).
- **Change the PIN:** in Supabase SQL Editor run `update private.admin set pin = 'new-pin';`
- **Free Supabase projects pause after a week of no use.** Open the site (or the Supabase dashboard) within a few days of the event so it's awake. If it was paused, click **Restore** in the Supabase dashboard.

## Demo mode
If `config.js` is left blank, the site runs entirely in your browser (data saved only on that device). Double-click `index.html` to try it with no setup.
