# LinkedIn Automation Bot

A JavaScript script using Playwright to automate LinkedIn messaging workflow.

## Features

- ✅ Automated LinkedIn login with retry logic
- ✅ Bulk profile messaging from a list
- ✅ Error handling and logging
- ✅ Rate limiting to avoid detection
- ✅ Graceful failure handling

## Setup

1. Install dependencies:
```bash
npm install
npx playwright install
```

2. Configure your credentials and data:
   - Update `email.txt` with your LinkedIn email
   - Update `password.txt` with your LinkedIn password
   - Update `profiles.txt` with LinkedIn profile URLs (one per line)
   - Update `message.txt` with your message template

3. Run the bot:
```bash
node linkedin_bot.js
```

## Files Structure

- `linkedin_bot.js` - Main automation script
- `email.txt` - Your LinkedIn login email
- `password.txt` - Your LinkedIn login password
- `profiles.txt` - List of LinkedIn profile URLs to message
- `message.txt` - Message template to send

## Important Notes

- Use responsibly and respect LinkedIn's terms of service
- The script includes delays to avoid rate limiting
- Messages are only sent if the "Message" button is available
- Failed profiles are logged but don't stop the process
- The browser runs in non-headless mode by default for debugging

## Error Handling

- Login retries once if it fails initially
- Individual profile errors are logged and skipped
- Comprehensive logging throughout the process
- Graceful shutdown on interruption (Ctrl+C)

## Customization

You can modify the script to:
- Change browser settings (headless mode, viewport, etc.)
- Adjust delays between actions
- Modify selectors if LinkedIn updates their UI
- Add additional error handling or logging
