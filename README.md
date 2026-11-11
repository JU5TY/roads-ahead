# Roads Ahead

Expo (SDK 58) app that records your drive in the background and stores every trip on the device (SQLite).

## Layout

```
src/
  app/                    Expo Router routes (thin wrappers around screens)
    _layout.js            root stack; imports locationService first so the background task is
                          defined at launch, and resumes an interrupted drive
    (tabs)/_layout.js     bottom tabs + "● Recording" strip above the tab bar
    (tabs)/index.js       → HomeScreen (latest trip with map preview, totals)
    (tabs)/record.js      → RecordScreen (START/STOP, live metrics, Google Maps button)
    (tabs)/trips.js       → PastTripsScreen
    (tabs)/settings.js    → SettingsScreen
    trips/[id].js         → TripScreen (a single-drive trip shows the drive inline)
    drives/[id].js        → DriveScreen
    plans/[id].js         → PlanScreen (a planned trip: drive tabs, timeline, map)
    plans/add-stop.js     → AddStopScreen (search, dropped pins, Iconic Roads near the drive)
  screens/                Home, Record, Past Trips, Trip, Drive, Settings
  components/             RouteMap, RoutePreview, TripCard, TelemetryCard, TimelineCard, sheets
  components/charts/      LineChart (drag to inspect), SpeedBandsBar, DayDistanceBars, ChartsCard
  hooks/                  useActiveDrive, useTripPreview
  services/locationService.js   LOCATION_TRACKING_TASK, start/stop/resume a drive
  services/placeService.js      reverse-geocoded place names per drive, and names for dropped pins
  services/placeSearch.js       the planner's place search (Photon); the only file that talks to it
  services/routing.js           the planner's road routes (Google Routes); the only file that talks to it
  storage/routeStorage.js       road lines kept for up to 30 days
  hooks/usePlanRoutes.js        asks for the drive being looked at; miles and times kept in memory only
  storage/db.js                 SQLite connection + schema migrations
  storage/tripStorage.js        trips (name, notes) and listing
  storage/driveStorage.js       drives (one START→STOP recording) and their GPS points
  storage/planStorage.js        plans, their drives and stops
  utils/plans.js                the trip planner's rules (pure functions)
  utils/navLinks.js             Google Maps, Apple Maps and Waze links for a drive (pure functions)
  utils/geoMath.js              per-drive metrics engine (pure functions)
  utils/tripSummary.js          combining drives into trips and days (pure functions)
  utils/timeline.js             stop-by-stop timelines for drives and trips (pure functions)
  utils/chartData.js            elevation/speed series and speed bands from GPS points (pure functions)
  utils/format.js               display formatting
```

## Trips, drives and days

- A **drive** is one START → STOP recording. A **trip** contains one or more drives.
- On START, if the last drive ended within 3 days, the app offers **Continue "<trip>"** or **Start a new trip**.
- **Days** aren't stored: drives are grouped by the local date they started. Only driving days are numbered (Day 1, 2, 3).
- Trip totals add up distance, driving time, climbing and stops, and take the maximum top speed, altitude and longest stint. Overall average speed uses time on the road only, so overnight breaks are excluded.
- Trip options: edit name and notes, delete, or (for a single drive) add it to another trip. Drive options: move to another trip or a new one, delete.

## Trip planner

- A **plan** is a trip to come, split into **drives** (Drive 1, Drive 2), each a list of stops. It lives on the Trips tab's **Planned** side.
- Each drive starts where the one before ends, unless it's set to start somewhere else (after a ferry, train or hire car). Drive 1 starts wherever the phone is, unless set.
- An **Iconic Road** in a plan is a leg driven along, not a stop. It's driven from whichever end is nearer.
- Stops are added by searching for a place or by long-pressing the map to drop a pin, and reordered by dragging their handle.

### Place search: Photon

The search box uses [Photon](https://photon.komoot.io), Komoot's free public search over OpenStreetMap data. It needs no account or key and costs nothing. OpenStreetMap's licence asks for credit, so the results show "Search © OpenStreetMap contributors".

- **One file:** `src/services/placeSearch.js` is the only code that talks to Photon. `searchPlaces(text, { near })` returns the app's own places (`{ id, name, detail, latitude, longitude }`), so moving to another service (Mapbox, Google, or our own Photon server) means rewriting that file alone. Check the new service's rules on storing results first.
- **Saved stops keep their own name and coordinates**, with no Photon ID, so plans aren't affected by a change of service.
- **Light use:** it asks only after a pause in typing and from 3 letters, near the drive being planned. A newer search cancels the one before.
- **If Photon fails** (no match, offline, an error or over 5 seconds), `searchPlaces` returns `{ places: [] }` or `{ failed: true }` and never throws. The screen says so and suggests dropping a pin.
- **Dropped pins don't use Photon.** The phone's own geocoder names them (expo-location). If that fails too, the stop is saved as "Dropped pin" at its exact position.

Photon's public server has no guarantee of service. If the app outgrows it, run our own Photon or switch service, as above.

### Road routes: Google Routes

A drive's miles, time and the line along the real roads come from Google's [Routes API](https://developers.google.com/maps/documentation/routes) on Android. Until a route comes back, or if it can't, the map draws straight dotted lines between the stops.

- **One file:** `src/services/routing.js` is the only code that talks to Google. `routeDrive(points)` returns `{ metres, seconds, legs, line }`, or `{ failed: true }` / `{ limited: true }`, and never throws.
- **Google's rules decide what's kept.** Its routes may only be shown on a Google map, so plan card thumbnails stay straight lines between the stops. The line may be kept for 30 days (`routeStorage.js` deletes older ones, and they're never in the backup file). Miles and times may not be kept, so they're held in memory until the app closes.
- **Asked for sparingly:** only the drive being looked at, once per app run unless its stops change. The Planned list never asks.
- **Cheaper tier only:** no live traffic and at most 10 points between origin and destination, so a longer drive is asked for in parts. That keeps every request in Google's Essentials tier (about 10,000 free a month).
- **Cost limits:** a daily quota in Google Cloud (320 requests, once the account is off the free trial), each phone's own limit of 100 requests a day, and a budget alert by email.
- **Key:** `GOOGLE_ROUTES_API_KEY` in EAS (environment preview), a separate key locked to the Android app and the Routes API. Google checks the package name and the signing certificate's SHA-1, set in `app.config.js`.
- **iPhone:** Google's routes can't be shown on Apple Maps. The plan is Apple's own routing (MapKit directions) behind the same file, before the iPhone release.

## How the metrics work

All data is stored in metric (metres, m/s). The Settings page switches the display between km and miles.

- **Distance**: Haversine sum of consecutive fixes. Fixes with horizontal accuracy worse than 50 m, or jumps faster than 324 km/h, are dropped.
- **Rest stops / auto-pause**: staying within 100 m of one spot for 5+ minutes. A crawling traffic jam keeps leaving that radius, so it counts as driving, not a stop. On iOS no fixes arrive while you're parked, so a long gap between fixes is judged by its average speed.
- **Moving time** is the elapsed time minus rest stops, minus idle time before you first move or after your last movement.
- **Average speed**: *while moving* = distance / moving time; *overall* = distance / total elapsed time, stops included.
- **Top speed** is the highest speed held for at least 3 seconds, so a single GPS spike doesn't count.
- **Elevation gain** uses a 5 m hysteresis. Note that Android GPS altitude is usually height above the WGS84 ellipsoid, not sea level, so max altitude can be off by tens of metres.
- **Longest stint** is the most driving time between rest stops. The Record tab's *Since Break* tile shows the current one.
- **Place names** for the start, end and rest stops come from the phone's reverse geocoder after a trip ends. Lookups that fail while offline are retried when you open the trip.

## Tests

```bash
npm test
```

Jest with jest-expo (development only, nothing added to the app). The tests cover the metrics rules, the sat nav links, the planner's rules and place search, with Photon's replies faked.

## Outside services and costs

Everything the app (and its print server) relies on outside the phone, what's free, and what stops a bill. Checked 11 Nov 2026; providers change their prices, so check the linked pages now and then. **Rule: nothing may cost money while nobody's using it.**

| Service | What it does | Free allowance | After that | Status |
|---|---|---|---|---|
| Google Maps SDK for Android | The map on Android | Unlimited ($0 per map load) | Free | Live |
| Google Routes API | Planner: miles, times, lines along the roads | ~10,000 requests a month (Essentials) | ~$5 per 1,000 | Built, Android |
| Apple Maps (MapKit) | The map on iPhone | Free, built into iOS | Free | Live (iPhone untested) |
| The phone's geocoder | Place names for drives, stops and dropped pins | Free, part of Android and iOS | Free (the phone slows heavy use) | Live |
| Photon (Komoot) | Planner: place search | Free public server, fair use | Free (no paid tier) | Live |
| Google Maps, Waze, Apple Maps links | Handing a drive to the sat nav | Free, just links | Free | Live |
| Expo EAS | App builds and over-the-air updates | 15 Android + 15 iOS builds a month; updates for 1,000 users a month | Free plan stops; paid plans from $19 a month | Live |
| Cloudflare Workers + R2 | Print server and its PDFs | 100,000 requests a day; R2 10 GB and 1M writes a month | Workers free plan stops; R2 bills overage | Built, not deployed |
| Stripe | Print payments | No monthly fee | 1.5% + 20p per UK card payment | Built, not live |
| Prodigi | Printing and posting | No monthly fee | The print and postage, per order | Built, not live |
| Google Play / App Store | Selling Premium | | Planned: 15% of sales | Not built |

### Google Cloud (Maps SDK and Routes API)

- **Account:** one Google Cloud project, **on the free trial until 27 January 2027**. The trial can't charge anything, but it can't change quotas either. **Before 27 January 2027, upgrade to a paid account, or the Android map stops working for everyone.** Straight after upgrading, set the Routes cap below.
- **Keys** (EAS, environment preview): `GOOGLE_MAPS_API_KEY` ("Maps Platform API Key") for the map, and `GOOGLE_ROUTES_API_KEY` ("Routes API Key") for routing, locked to the Android app (`com.justinwoodford.roadtrip`, signing SHA-1 in `app.config.js`) and to the Routes API only. Google refuses the routing key from anywhere else (tested).
- **What stops a bill:**
  - The map is free at any volume (no map IDs or Street View are used, which would be billed).
  - Routes: a daily quota of **320** on "Directions - ComputeRoutes per request quota per day" (31 × 320 = 9,920, under the free 10,000), set once off the trial. If the budget's "Spend cap enforcement" offers the Routes API, a cap on it alone also works; never cap all services, or the map pauses too.
  - Each phone keeps to **100** routing requests a day (`services/routing.js`).
  - Requests stay in the cheaper Essentials tier: no live traffic, at most 10 points in between.
  - A **£1 monthly budget alert** emails at 50, 90, 100 and 150%. It warns; it doesn't stop anything.
  - Don't add a "turn billing off" switch: it would break the map too.
- **Terms to keep:** Routes results only on a Google map (so not in plan card thumbnails, and not on Apple Maps: the iPhone will use Apple's own routing). Route lines kept at most 30 days; miles and times not kept at all. Details under Road routes above.

### Photon

- [photon.komoot.io](https://photon.komoot.io): free, no account or key, no paid tier, so it can never bill. Fair use: ask only after a pause in typing, from 3 letters, and cancel the last search when a new one starts (`services/placeSearch.js`).
- **Terms:** OpenStreetMap data under the ODbL. Credit "© OpenStreetMap contributors" under the results; results may be kept.
- **Risk:** no guaranteed service. Search failing never breaks the app; dropped pins still work.

### Expo EAS

- Free plan: about 15 Android and 15 iOS builds a month (they reset on the 1st), and updates for 1,000 monthly users. The free plan has no overage charges: at the limit, builds wait until next month and updates stop reaching new users.
- Updates go to the `preview` channel (`npx eas-cli@latest update --channel preview --environment preview`).
- **Watch:** past 1,000 users a month, updates need the $19 Starter plan.

### Print server (Cloudflare, Stripe, Prodigi)

- Setup and running are in `server/poster/README.md`. Not deployed yet: until `EXPO_PUBLIC_POSTER_API` is set, Order says "coming soon".
- **Cloudflare:** the Workers free plan (100,000 requests a day) has no bill to run up. **R2 does bill** past its free 10 GB a month, so its PDFs are deleted after 14 days; a few orders a day stay far under it.
- **Stripe and Prodigi** charge only per order (Stripe 1.5% + 20p a UK card; Prodigi the print and postage), and the price set on the server covers both. Test with Stripe's test keys and Prodigi's `sandbox_` key, which never charge.

### Data in the app

- Iconic Roads and the example trip: © OpenStreetMap contributors (ODbL), credited on the You screen.
- Country borders: Natural Earth (public domain).

## Running on your phone

### Option A: Expo Go (quick UI check, foreground only)

```bash
npm install
npx expo start --go --tunnel
```

`--go` is needed because `expo-dev-client` is installed; without it the QR code targets the development build. In Expo Go, tap **Enter URL manually** and type the `Metro: exp://…` address from the terminal with `exp` changed to `exps`. Plain `exp://` (http) was blocked on our home network, but `exps://` (https) works. Expo Go **can't** run background location. The app detects this and records only while it's open, and shows a warning on the dashboard.

### Option B: Development build (needed for real background tracking)

Using EAS in the cloud (no Xcode or Android Studio needed):

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform android   # or ios
```

Install the build on your phone from the link EAS gives you, then run `npx expo start` and open the project from the dev build.

Or build locally with the phone plugged in:

```bash
npx expo run:android --device
npx expo run:ios --device       # needs Xcode + a signing team
```

For iOS dev builds on your own device, turn on **Developer Mode** (Settings → Privacy & Security). An Apple Developer account is required for EAS iOS builds.

### Permissions on the phone

Tapping **START TRIP** the first time shows a short explanation, then the system location prompt.

- Choose **Precise** and **While using the app** (iOS: **Allow While Using App**). "Allow all the time" is **not** needed: tracking starts while the app is open and continues in the background through the Android foreground-service notification or the iOS blue location indicator.
- If location is turned off or set to approximate, the app explains this and offers a shortcut to Settings.
- On aggressive battery savers (some Samsung and Xiaomi phones), set Roads Ahead's battery use to **Unrestricted** if routes have gaps.

### Google Maps key (Android builds only)

On Android, `react-native-maps` uses Google Maps. Expo Go includes its own key. For dev and production builds, create a Maps SDK for Android key and put it in `.env`:

```
GOOGLE_MAPS_API_KEY=your-key
```

`app.config.js` reads this key at build time. iOS uses Apple Maps, so it needs no key.
