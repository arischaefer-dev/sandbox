const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 800 });

  // 1. Navigate to the app
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2' });

  // 2. Wait for welcome screen
  await page.waitForSelector('#welcome-screen.active', { timeout: 5000 });
  await page.screenshot({ path: '/opt/cursor/artifacts/ss_welcome.png' });
  console.log('Screenshot: ss_welcome.png');

  // 3. Type name and click LET'S GO!
  await page.type('#name-input', 'Alex');
  await page.click('#welcome-go');

  // 4. Wait for home screen
  await new Promise(r => setTimeout(r, 500));
  await page.waitForSelector('#home-screen.active', { timeout: 5000 });
  await page.screenshot({ path: '/opt/cursor/artifacts/ss_home.png' });
  console.log('Screenshot: ss_home.png');

  // 5. Click PLAY
  await page.click('#play-btn');
  await new Promise(r => setTimeout(r, 500));
  await page.waitForSelector('#game-screen.active', { timeout: 5000 });
  await page.screenshot({ path: '/opt/cursor/artifacts/ss_gameplay.png' });
  console.log('Screenshot: ss_gameplay.png');

  // 6. Answer 10 questions
  for (let q = 0; q < 10; q++) {
    await page.waitForSelector('#g-question', { timeout: 5000 });

    const questionText = await page.$eval('#g-question', el => el.textContent);
    console.log(`Q${q + 1}: ${questionText}`);

    // Parse: "A + B = ?", "A − B = ?", "A × B = ?", "A ÷ B = ?"
    const match = questionText.match(/(\d+)\s*([+\−×÷\-])\s*(\d+)\s*=\s*\?/);
    if (!match) {
      console.error('Could not parse question:', questionText);
      break;
    }

    const a = parseInt(match[1], 10);
    const op = match[2];
    const b = parseInt(match[3], 10);

    let answer;
    switch (op) {
      case '+': answer = a + b; break;
      case '−': case '-': answer = a - b; break;
      case '×': answer = a * b; break;
      case '÷': answer = a / b; break;
      default:
        console.error('Unknown operator:', op);
        break;
    }

    console.log(`  Answer: ${answer}`);

    // Find and click the button with the correct answer
    const buttons = await page.$$('.ans-btn');
    let clicked = false;
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (parseInt(text, 10) === answer) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.error('  Could not find button for answer:', answer);
    }

    // Wait for transition to next question (correct answer timeout is 900ms in the game)
    await new Promise(r => setTimeout(r, 1100));
  }

  // 7. Wait for results screen
  await new Promise(r => setTimeout(r, 500));
  await page.waitForSelector('#result-screen.active', { timeout: 10000 });
  await page.screenshot({ path: '/opt/cursor/artifacts/ss_results.png' });
  console.log('Screenshot: ss_results.png');

  // 8. Click Home, take final screenshot
  await page.click('#r-home');
  await new Promise(r => setTimeout(r, 300));
  await page.waitForSelector('#home-screen.active', { timeout: 5000 });
  await page.screenshot({ path: '/opt/cursor/artifacts/ss_home_after.png' });
  console.log('Screenshot: ss_home_after.png');

  console.log('\nAll screenshots saved to /opt/cursor/artifacts/');
  await browser.close();
})();
