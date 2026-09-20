# Design A — Modern Utility Heating UI Specification

**Status:** Prototype specification  
**Scope:** Clickable frontend prototype using existing app functionality  
**Date:** 2026-09-19

## 1. Product direction

Design A is a calm, professional heating-control dashboard inspired by established smart-heating products. It prioritises immediate understanding over decorative imagery:

> At a glance, the user should know whether the home is comfortable, what the heating is doing, and what will happen next.

The design must not invent unsupported functionality. The prototype uses sample data only where necessary, while all interactions should correspond to behaviour already present in the application.

## 2. Research principles

Modern heating apps commonly centre the experience around:

- Room-by-room temperature control and schedules.
- Quick temporary overrides or boosts.
- A simple dashboard showing connected devices and current state.
- Separate energy/history views rather than putting dense reporting on the home screen.
- Clear status communication: heating active, idle, unavailable, saving, or error.

Reference products:

- tado° app: https://www.tado.com/en/app-services/app
- Drayton Wiser Home app: https://wiser.draytoncontrols.co.uk/pages/wiser-app
- Resideo/Honeywell Home app: https://www.resideo.com/us/en/resideo-smart-home-app/
- Google Nest Energy History: https://support.google.com/googlehome/answer/9247300?hl=EN-GB

These references inform interaction patterns and hierarchy only. Do not copy their branding, assets, or exact layouts.

## 3. Existing functionality to preserve

The current application already supports:

- Sign-in and session management.
- Heating-system/gateway discovery and selection.
- Multiple heating zones.
- Current and target temperatures.
- Interactive target-temperature dial.
- Writing a target temperature to a zone.
- Heating active/idle state.
- Hot-water state and control.
- Weekly schedules with multiple periods per day.
- Editing, copying, resetting, saving, and unsaved-change states for schedules.
- Temperature history charts with day/month ranges.
- Connection, loading, error, and refresh states.
- Light/dark themes.
- Mobile navigation and pull-to-refresh.

The prototype must represent each of these functions, even if the first pass uses mocked values.

## 4. Information architecture

Primary navigation:

1. **Home** — current comfort and quick controls.
2. **Schedule** — weekly heating programmes by zone.
3. **History** — temperature and heating history.

Secondary navigation through the menu/drawer:

- Heating system selection.
- Hot water.
- Theme/design selection.
- Account/session actions.
- Connection status and diagnostics.

Do not add Energy, Automation, Geofencing, AI, weather, or device integrations to the prototype unless the existing API already supports them. They may be future concepts, not current controls.

## 5. Visual language

### Colour

- Background: warm neutral/off-white, approximately `#F7F8FA`.
- Surface: white cards with subtle border, not heavy shadows.
- Text: charcoal/navy, high contrast.
- Heating active: warm orange/amber.
- Heating idle: cool slate/grey.
- Hot water active: restrained blue.
- Success/saved: green.
- Warning/unsaved: amber.
- Error: red.

Avoid gradients as the primary visual language. Avoid bright purple as the main action colour in Design A.

### Typography

- Large, highly legible temperature figures.
- Sentence-case labels.
- Small uppercase labels only for secondary metadata.
- Use weight and spacing rather than colour alone to indicate hierarchy.

### Surfaces

- Rounded cards, consistent radius.
- Thin borders and restrained shadows.
- Comfortable touch targets of at least 44px.
- No decorative animated house/boiler illustration on the Design A home screen.

### Motion

Use motion only to communicate state:

- Short transition when a temperature changes.
- Subtle status pulse when heating is active, optional.
- No continuously moving flow particles or animated decorative images.
- Respect `prefers-reduced-motion`.

## 6. Home screen

### Header

Show:

- Greeting or page title: `Home`.
- Selected heating system name if multiple systems exist.
- Connection indicator: Connected, Connecting, Offline, or Error.
- Menu button.

Example:

```text
Good evening
Main heating system                 Connected
```

### Home status card

A compact summary card should answer the user's immediate question:

```text
Home is comfortable
2 zones active · Next change at 22:30
```

The exact summary must derive from real zone state. If state is unavailable, show an explicit unavailable state rather than a guess.

### Zone cards

Render one card for each heating zone. A card contains:

- Zone name.
- Current temperature.
- Target temperature.
- Heating status: Heating or Idle.
- Next schedule event if available.
- Tap target opening the zone detail view.

Example:

```text
Living room                         Heating
21.0°C                              Target 20.5°C
Heating until 22:30                 View details ›
```

Cards should work for any number of zones. Do not assume only upstairs/downstairs zones.

### Hot-water card

Render only when hot-water data exists. Show:

- Hot-water name.
- Current status.
- Existing control action.
- Link to more detail if supported.

Example:

```text
Hot water                           On
Currently heating                   Control ›
```

### Quick actions

Only include actions backed by existing functionality:

- Open zone detail.
- Set target temperature.
- Open zone schedule.
- Control hot water where supported.
- Refresh data.

Do not add a Boost button unless the existing API/action is confirmed. If a temporary override is desired visually, label it as a future concept rather than a working button.

## 7. Zone detail screen

The existing detailed zone screen already provides the correct functional basis. Restyle it into a focused control page.

Show:

- Back navigation.
- Zone name.
- Current temperature.
- Target temperature.
- Heating status.
- Large temperature control/dial.
- Increment/decrement controls.
- Set-temperature action.
- View schedule action.
- Current request/error/saving status.

The dial must retain:

- Existing 5–35°C range.
- Existing 0.5°C increments.
- Pointer/touch interaction.
- Explicit save/set action.
- Disabled state when no change exists.

Avoid presenting current temperature and target temperature as if they are the same value.

## 8. Schedule screen

The schedule screen should preserve the existing editing model but make the hierarchy calmer.

### Schedule zone selection

Show zones as simple cards or rows with:

- Zone name.
- Short schedule summary.
- Unsaved-change indicator if applicable.
- Tap to open the weekly view.

### Weekly overview

Show:

- Seven days.
- Time-based heating periods.
- Temperature values for analogue heating zones.
- On/off values for binary devices.
- Clear selected-day state.
- Current day emphasis.

### Day editor

Retain existing support for:

- Add period.
- Change start time.
- Change target value.
- Remove period.
- Save current day.
- Save full week.
- Copy a day pattern.
- Reset day/week.
- Unsaved, saving, saved, copied, and error messages.

Unsaved changes must be highly visible but not alarming.

## 9. History screen

Rename the existing Stats concept to **History** in the visible navigation, while retaining the existing statistics implementation.

Show per zone:

- Current-temperature series.
- Target-temperature series.
- Day/month range switch.
- Previous/next period controls.
- Hover/tap details where supported.
- Loading and empty states.

Do not imply that the chart represents energy cost or gas consumption unless the backend supplies those measurements. Label it as temperature/heating history.

## 10. States and feedback

Every screen must account for:

- Loading.
- Connected.
- Connecting.
- Offline/disconnected.
- API error.
- Empty systems.
- Empty zones.
- Missing temperature.
- Saving.
- Saved.
- Unsaved changes.
- Expired session.

Use a consistent status treatment. Avoid replacing useful content with a generic full-screen spinner when partial data is available.

## 11. Design toggle

The prototype must support two designs:

- `classic` — existing visual design and animated system overview.
- `modern-utility` — Design A specification in this document.

The toggle should:

- Be accessible from the existing menu/settings area.
- Persist using the existing browser storage approach.
- Change presentation only, not API calls, state, or permissions.
- Default to the existing design until the user chooses Design A.
- Be available on desktop and mobile.

Recommended label:

```text
Interface style
○ Classic
● Modern utility
```

## 12. Responsive behaviour

### Mobile

- Single-column cards.
- Bottom navigation remains available.
- Zone detail uses a full-width dial and sticky primary action where practical.
- Schedule editor may scroll horizontally for the week overview.
- Menu remains the location for system/theme/session actions.

### Desktop

- Constrain content to a readable max width.
- Use a two-column home layout when there are enough zones:
  - Main column: status and zones.
  - Secondary column: hot water, schedule preview, connection/system card.
- Do not simply stretch mobile cards across the entire screen.

## 13. Prototype acceptance criteria

The clickable prototype is ready for review when:

- The user can switch between Classic and Modern Utility.
- Modern Utility has Home, Schedule, and History navigation.
- Home displays mocked or live zones, current/target values, statuses, and hot water where present.
- A zone opens into a functional-looking temperature detail view.
- Temperature increment/decrement and dial interactions visibly update the target.
- Schedule navigation reaches zone, week, and day views.
- Schedule editing states are represented without requiring backend writes in prototype mode.
- History displays day/month controls and charts.
- Loading, empty, error, and unsaved states are represented.
- No unsupported feature is presented as working.
- The existing Classic design remains available and unchanged.
- The prototype works at mobile and desktop widths.

## 14. Implementation boundary

The first prototype should be a frontend presentation layer. It should not:

- Change provider API contracts.
- Change database schema.
- Add new heating capabilities.
- Add subscriptions, energy billing, AI, geofencing, weather, or automation.
- Remove existing controls.

After visual approval, the Modern Utility components can be connected to the existing state and API handlers incrementally, with the original design retained as a fallback.
