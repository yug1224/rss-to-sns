import { launch } from 'jsr:@astral/astral';

export default async (url: string) => {
  const browser = await launch();

  const page = await browser.newPage();

  await page.goto(url);

  if (url.startsWith('https://speakerdeck.com')) {
    // SpeakerDeckの場合は、PDFをダウンロードする
    const el = await page.$('a[title="Download PDF"]');
    const href = await el?.getAttribute('href') || '';

    const response = await fetch(href);
    if (response.body) {
      const file = await Deno.open('page.pdf', { write: true, create: true });
      await response.body.pipeTo(file.writable);
    }
  } else {
    // Webページの場合は、PDF化する
    const pdf = await page.pdf();
    Deno.writeFileSync('page.pdf', pdf);
  }

  await browser.close();
  console.log('Success createPDF');
};
