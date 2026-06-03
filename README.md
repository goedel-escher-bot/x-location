# X Location

A Chrome extension that shows the country an account is based in next to every username on X/Twitter.

![badge example](https://img.shields.io/badge/based%20in-United%20States-1d9bf0)

## How it works

When you click "About this account" on any profile, the extension captures the data and displays a country badge next to that user's name everywhere they appear on the site. It also automatically fetches the country for every other username you see on your timeline — no extra clicks needed after the first one.

Country data is cached in `localStorage` so badges appear instantly on future visits.

## Installation

1. Download or clone this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `x-location` folder

## Usage

- Browse X normally — badges appear automatically next to usernames once the extension has fetched their country
- Click "About this account" on any profile to bootstrap the extension for the first time (only needed once)
- Country data persists across sessions

## Notes

- Uses X's internal `AboutAccountQuery` GraphQL endpoint with your existing session credentials — no API key required
- All data is stored locally in your browser (`localStorage`) and never sent anywhere
- The extension only runs on `twitter.com` and `x.com`
