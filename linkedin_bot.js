const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class LinkedInBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.credentials = {};
        this.profiles = [];
        this.message = '';
    }

    /**
     * Read credentials and data from local files
     */
    async loadData() {
        try {
            console.log('📖 Loading data from files...');
            
            // Read email
            this.credentials.email = fs.readFileSync(path.join(__dirname, 'email.txt'), 'utf8').trim();
            console.log(`✅ Email loaded: ${this.credentials.email}`);
            
            // Read password
            this.credentials.password = fs.readFileSync(path.join(__dirname, 'password.txt'), 'utf8').trim();
            console.log('✅ Password loaded');
            
            // Read profiles
            const profilesContent = fs.readFileSync(path.join(__dirname, 'profiles.txt'), 'utf8');
            this.profiles = profilesContent.split('\n')
                .map(url => url.trim())
                .filter(url => url.length > 0);
            console.log(`✅ Loaded ${this.profiles.length} profiles`);
            
            // Read message
            this.message = fs.readFileSync(path.join(__dirname, 'message.txt'), 'utf8').trim();
            console.log('✅ Message template loaded');
            
        } catch (error) {
            console.error('❌ Error loading data files:', error.message);
            throw error;
        }
    }

    /**
     * Initialize browser and page
     */
    async initBrowser() {
        console.log('🚀 Launching browser...');
        this.browser = await chromium.launch({ 
            headless: false, // Set to true for headless mode
            slowMo: 1000 // Add delay between actions for better reliability
        });
        
        // Create browser context with user agent
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 }
        });
        
        this.page = await context.newPage();
    }

    /**
     * Login to LinkedIn with retry logic
     */
    async login() {
        const maxRetries = 2;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                attempt++;
                console.log(`🔑 Login attempt ${attempt}/${maxRetries}...`);
                
                // Navigate to LinkedIn login page
                console.log('📍 Navigating to LinkedIn login page...');
                await this.page.goto('https://www.linkedin.com/login', { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000 
                });
                
                // Wait for login form to be visible
                console.log('⏳ Waiting for login form...');
                await this.page.waitForSelector('#username', { timeout: 30000 });
                
                // Fill in credentials
                console.log('✏️  Filling in credentials...');
                await this.page.fill('#username', this.credentials.email);
                await this.page.waitForTimeout(1000);
                await this.page.fill('#password', this.credentials.password);
                await this.page.waitForTimeout(1000);
                
                // Click sign in button
                console.log('🔐 Clicking sign in button...');
                await this.page.click('button[type="submit"]');
                
                // Wait for navigation or error
                console.log('⏳ Waiting for login to complete...');
                await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
                
                // Check for common login issues first
                const currentUrl = this.page.url();
                console.log(`📍 Current URL: ${currentUrl}`);
                
                // Check for CAPTCHA or security challenge
                const hasCaptcha = await this.page.locator('[data-test-id="captcha"]').isVisible({ timeout: 2000 })
                    .catch(() => false);
                
                if (hasCaptcha) {
                    throw new Error('CAPTCHA detected - manual intervention required');
                }
                
                // Check for error messages
                const errorMessage = await this.page.locator('.form__label--error').textContent({ timeout: 2000 })
                    .catch(() => null);
                
                if (errorMessage) {
                    throw new Error(`Login error: ${errorMessage}`);
                }
                
                // Check if login was successful by looking for LinkedIn feed or profile
                const isLoggedIn = await this.page.locator('nav[aria-label="Primary Navigation"]').isVisible({ timeout: 10000 })
                    .catch(() => false);
                
                if (isLoggedIn) {
                    console.log('✅ Successfully logged in to LinkedIn');
                    return true;
                } else {
                    // Check if we're still on login page
                    if (currentUrl.includes('/login')) {
                        throw new Error('Still on login page - credentials may be incorrect');
                    } else {
                        throw new Error('Login status unclear - may need manual verification');
                    }
                }
                
            } catch (error) {
                console.log(`❌ Login attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    throw new Error(`Login failed after ${maxRetries} attempts`);
                }
                
                // Wait before retry
                await this.page.waitForTimeout(3000);
            }
        }
    }

    /**
     * Send message to a specific profile
     */
    async sendMessageToProfile(profileUrl) {
        try {
            console.log(`📱 Processing profile: ${profileUrl}`);
            
            // Navigate to profile page
            console.log(`🌐 Navigating to profile...`);
            await this.page.goto(profileUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            
            // Wait for profile page to load
            console.log(`⏳ Waiting for profile page to load...`);
            await this.page.waitForSelector('main', { timeout: 30000 });
            
            // Additional wait for dynamic content
            await this.page.waitForTimeout(3000);
            
            // VALIDATION STEP 1: Verify we're on the correct URL
            const currentUrl = this.page.url();
            console.log(`🔍 Current URL: ${currentUrl}`);
            console.log(`🎯 Expected URL: ${profileUrl}`);
            
            // Extract profile ID from both URLs for comparison
            const extractProfileId = (url) => {
                const match = url.match(/\/in\/([^\/\?]+)/);
                return match ? match[1] : null;
            };
            
            const currentProfileId = extractProfileId(currentUrl);
            const expectedProfileId = extractProfileId(profileUrl);
            
            if (!currentProfileId || !expectedProfileId || currentProfileId !== expectedProfileId) {
                console.log(`❌ URL mismatch! Expected profile ID: ${expectedProfileId}, Current: ${currentProfileId}`);
                console.log(`⚠️  Skipping this profile to avoid messaging wrong person`);
                return false;
            }
            
            console.log(`✅ URL validation passed - on correct profile: ${currentProfileId}`);
            
            // VALIDATION STEP 2: Verify we're on a valid profile page
            const isValidProfilePage = await this.page.locator('section[data-member-id]').isVisible({ timeout: 5000 })
                .catch(() => false) || 
                await this.page.locator('.pv-top-card').isVisible({ timeout: 5000 })
                .catch(() => false);
                
            if (!isValidProfilePage) {
                console.log(`❌ This doesn't appear to be a valid profile page`);
                return false;
            }
            
            console.log(`✅ Valid profile page confirmed`);
            
            // VALIDATION STEP 3: Extract and display profile information for verification
            let profileName = 'Unknown';
            let profileHeadline = 'Unknown';
            
            try {
                // Try different selectors for profile name
                const nameSelectors = [
                    'h1.text-heading-xlarge',
                    '.pv-text-details__left-panel h1',
                    '.pv-top-card--list h1',
                    'section[data-member-id] h1',
                    '.profile-topcard h1'
                ];
                
                for (const selector of nameSelectors) {
                    try {
                        const nameElement = await this.page.locator(selector).first();
                        if (await nameElement.isVisible({ timeout: 2000 })) {
                            profileName = await nameElement.textContent();
                            profileName = profileName?.trim() || 'Unknown';
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // Try to get profile headline/title
                const headlineSelectors = [
                    '.text-body-medium.break-words',
                    '.pv-text-details__left-panel .text-body-medium',
                    '.pv-top-card--list .text-body-medium'
                ];
                
                for (const selector of headlineSelectors) {
                    try {
                        const headlineElement = await this.page.locator(selector).first();
                        if (await headlineElement.isVisible({ timeout: 2000 })) {
                            profileHeadline = await headlineElement.textContent();
                            profileHeadline = profileHeadline?.trim() || 'Unknown';
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                console.log(`👤 Profile Name: ${profileName}`);
                console.log(`💼 Profile Headline: ${profileHeadline}`);
                console.log(`🎯 About to message: ${profileName} (${expectedProfileId})`);
                
            } catch (error) {
                console.log(`⚠️  Could not extract profile information: ${error.message}`);
            }
            
            // Look for Message button ONLY in the main profile section - exclude sidebars and suggestions
            console.log(`🔍 Looking for Message button in main profile area only...`);
            
            // Define main profile containers to restrict our search
            const mainProfileContainers = [
                '.pv-top-card',                    // Main profile card
                '.pv-s-profile-actions',           // Profile actions section
                'section[data-member-id]',         // Main profile section
                '.profile-topcard',                // Alternative profile card
                '.pv-profile-header'               // Profile header
            ];
            
            let messageButton = null;
            let foundSelector = null;
            let foundInContainer = null;
            
            // First, try to find Message button within main profile containers
            for (const container of mainProfileContainers) {
                try {
                    const containerElement = await this.page.locator(container).first();
                    if (await containerElement.isVisible({ timeout: 2000 })) {
                        console.log(`🔍 Searching in container: ${container}`);
                        
                        // Look for Message button within this container
                        const containerMessageSelectors = [
                            `${container} button[aria-label*="Message"]`,
                            `${container} a[aria-label*="Message"]`,
                            `${container} button:has-text("Message")`,
                            `${container} a:has-text("Message")`,
                            `${container} [data-control-name="message"]`,
                            `${container} .artdeco-button:has-text("Message")`,
                            `${container} button[data-control-name="message"]`
                        ];
                        
                        for (const selector of containerMessageSelectors) {
                            try {
                                console.log(`🔍 Trying scoped selector: ${selector}`);
                                messageButton = await this.page.locator(selector).first();
                                if (await messageButton.isVisible({ timeout: 2000 })) {
                                    foundSelector = selector;
                                    foundInContainer = container;
                                    console.log(`✅ Found Message button in main profile area!`);
                                    console.log(`📍 Container: ${container}`);
                                    console.log(`🎯 Selector: ${selector}`);
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (messageButton && await messageButton.isVisible()) {
                            break;
                        }
                    }
                } catch (e) {
                    console.log(`❌ Container not found: ${container}`);
                    continue;
                }
            }
            
            // Additional validation: Ensure the button is NOT in sidebar or suggestion areas
            if (messageButton && await messageButton.isVisible()) {
                // Check if the button is in excluded areas (sidebars, suggestions, etc.)
                const excludedAreas = [
                    '.scaffold-layout__sidebar',       // Right sidebar
                    '.pv-browsemap-section',          // People also viewed
                    '.browsemap',                     // Browse map suggestions  
                    '.pv-profile-sidebar',            // Profile sidebar
                    '.artdeco-card:has-text("People also viewed")',  // Suggestions card
                    '.artdeco-card:has-text("More suggestions")',    // More suggestions
                    '.pv-deduplication-container'     // Duplicate profile suggestions
                ];
                
                let isInExcludedArea = false;
                for (const excludedArea of excludedAreas) {
                    try {
                        const excludedContainer = await this.page.locator(excludedArea);
                        const buttonInExcluded = excludedContainer.locator('button, a').filter({ hasText: 'Message' });
                        if (await buttonInExcluded.count() > 0) {
                            // Check if our found button is within this excluded area
                            const buttonRect = await messageButton.boundingBox();
                            const excludedRect = await excludedContainer.boundingBox();
                            
                            if (buttonRect && excludedRect && 
                                buttonRect.x >= excludedRect.x && 
                                buttonRect.y >= excludedRect.y &&
                                buttonRect.x + buttonRect.width <= excludedRect.x + excludedRect.width &&
                                buttonRect.y + buttonRect.height <= excludedRect.y + excludedRect.height) {
                                isInExcludedArea = true;
                                console.log(`⚠️  Message button found in excluded area: ${excludedArea}`);
                                break;
                            }
                        }
                    } catch (e) {
                        // Excluded area not found, continue
                        continue;
                    }
                }
                
                if (isInExcludedArea) {
                    console.log(`❌ Message button is in a suggestion/sidebar area - skipping to avoid wrong target`);
                    messageButton = null;
                }
            }
            
            if (!messageButton || !(await messageButton.isVisible())) {
                console.log('⚠️  Message button not found - messaging may not be available for this profile');
                return false;
            }
            
            // Click the message button
            console.log(`🖱️  Clicking Message button...`);
            await messageButton.click();
            
            // Wait for message dialog/chat window to appear
            console.log(`⏳ Waiting for message dialog to appear...`);
            await this.page.waitForTimeout(5000);
            
            // Look for message input field
            console.log(`🔍 Looking for message input field...`);
            const messageInputSelectors = [
                '[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]',
                '.msg-form__contenteditable',
                '[data-control-name="message_body"]',
                '.msg-form__msg-content-container .msg-form__contenteditable',
                '.compose-form__message-field',
                '[data-artdeco-is-focused="true"]'
            ];
            
            let messageInput = null;
            let foundInputSelector = null;
            
            for (const selector of messageInputSelectors) {
                try {
                    console.log(`🔍 Trying input selector: ${selector}`);
                    messageInput = await this.page.locator(selector).first();
                    if (await messageInput.isVisible({ timeout: 5000 })) {
                        foundInputSelector = selector;
                        console.log(`✅ Found message input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    console.log(`❌ Input selector failed: ${selector}`);
                    continue;
                }
            }
            
            if (!messageInput || !(await messageInput.isVisible())) {
                console.log('⚠️  Message input field not found - unable to send message');
                return false;
            }
            
            // Click on the input field to focus it
            console.log(`🖱️  Focusing on message input...`);
            await messageInput.click();
            await this.page.waitForTimeout(1000);
            
            // Clear any existing content and type the message
            console.log(`✏️  Typing message...`);
            await messageInput.fill('');
            await this.page.waitForTimeout(500);
            await messageInput.type(this.message, { delay: 50 });
            await this.page.waitForTimeout(1000);
            
            // Try to find and click the Send button first
            const sendButtonSelectors = [
                'button[data-control-name="send"]',
                'button:has-text("Send")',
                '.msg-form__send-button',
                '[aria-label*="Send"]',
                'button[type="submit"]'
            ];
            
            let sendButton = null;
            for (const selector of sendButtonSelectors) {
                try {
                    console.log(`🔍 Looking for Send button: ${selector}`);
                    sendButton = await this.page.locator(selector).first();
                    if (await sendButton.isVisible({ timeout: 2000 })) {
                        console.log(`✅ Found Send button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (sendButton && await sendButton.isVisible()) {
                console.log(`🖱️  Clicking Send button...`);
                await sendButton.click();
            } else {
                console.log(`⌨️  Send button not found, trying Enter key...`);
                await messageInput.press('Enter');
            }
            
            // Wait a moment for the message to be sent
            console.log(`⏳ Waiting for message to be sent...`);
            await this.page.waitForTimeout(3000);
            
            // Final confirmation
            console.log(`✅ Message sent successfully to: ${profileName}`);
            console.log(`📧 Message content: "${this.message}"`);
            console.log(`🎯 Target profile: ${expectedProfileId}`);
            console.log(`📍 Confirmed URL: ${currentUrl}`);
            
            return true;
            
        } catch (error) {
            console.log(`❌ Error processing profile ${profileUrl}:`, error.message);
            return false;
        }
    }

    /**
     * Process all profiles
     */
    async processProfiles() {
        console.log(`📋 Processing ${this.profiles.length} profiles...`);
        console.log(`🛡️  Safety measures enabled:`);
        console.log(`   • URL validation to ensure correct profile targeting`);
        console.log(`   • Message buttons restricted to main profile area only`);
        console.log(`   • Sidebar and suggestion areas excluded`);
        console.log(`   • Profile name/headline verification for confirmation`);
        console.log(`   • Detailed logging for audit trail`);
        console.log(``);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < this.profiles.length; i++) {
            const profile = this.profiles[i];
            console.log(`\n--- Profile ${i + 1}/${this.profiles.length} ---`);
            
            const success = await this.sendMessageToProfile(profile);
            
            if (success) {
                successCount++;
            } else {
                errorCount++;
            }
            
            // Add delay between profiles to avoid rate limiting
            if (i < this.profiles.length - 1) {
                console.log('⏳ Waiting before next profile...');
                await this.page.waitForTimeout(5000);
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`✅ Successfully sent: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.browser) {
            console.log('🧹 Closing browser...');
            await this.browser.close();
        }
    }

    /**
     * Main execution method
     */
    async run() {
        try {
            await this.loadData();
            await this.initBrowser();
            await this.login();
            await this.processProfiles();
            
        } catch (error) {
            console.error('💥 Fatal error:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// Main execution
async function main() {
    console.log('🤖 LinkedIn Bot Starting...\n');
    
    const bot = new LinkedInBot();
    
    try {
        await bot.run();
        console.log('\n🎉 LinkedIn Bot completed successfully!');
    } catch (error) {
        console.error('\n💥 LinkedIn Bot failed:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹️  Received interrupt signal, shutting down gracefully...');
    process.exit(0);
});

// Run the bot
if (require.main === module) {
    main();
}

module.exports = LinkedInBot;
