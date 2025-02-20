import { abortable } from 'jsr:@std/async';
import puppeteer from 'npm:puppeteer-core';

export default async (url: string, path: string) => {
  const retry = async (retryCount = 0) => {
    let browser: puppeteer.Browser | undefined;
    try {
      const c = new AbortController();

      const timer = setTimeout(() => {
        console.log('Timeout createPDF');
        return c.abort();
      }, 1000 * 60 * 5);

      await abortable(
        (async () => {
          if (url.endsWith('.pdf')) {
            // pdfファイルの場合は、そのまま保存する
            const response = await fetch(url);
            if (response.body) {
              const file = await Deno.open(path, { write: true, create: true });
              await response.body.pipeTo(file.writable);
            }
            return;
          }

          browser = await puppeteer.launch({ channel: 'chrome' });
          const page = await browser.newPage();
          page.setDefaultNavigationTimeout(1000 * 60 * 3);
          page.setDefaultTimeout(1000 * 60 * 3);
          await page.goto(url, { waitUntil: 'load' });

          if (url.startsWith('https://speakerdeck.com')) {
            // SpeakerDeckの場合は、PDFをダウンロードする
            let href = '';
            try {
              href = await page.$eval('a[title="Download PDF"]', (el) => el.getAttribute('href'));
            } catch {
              console.log('href not found');
            }
            // hrefが存在しない場合は早期リターンする
            if (!href) return;

            const response = await fetch(href);
            if (response.body) {
              const file = await Deno.open(path, { write: true, create: true });
              await response.body.pipeTo(file.writable);
            }
          } else if (url.startsWith('https://www.docswell.com')) {
            // docswellの場合は、PDFをダウンロードする
            let href = '';
            try {
              href = await page.$eval('a[href$="download"]', (el) => el.getAttribute('href') || '');
            } catch {
              console.log('href not found');
            }
            // hrefが存在しない場合は早期リターンする
            if (!href) return;

            const response = await fetch(href);
            if (response.body) {
              const file = await Deno.open(path, { write: true, create: true });
              await response.body.pipeTo(file.writable);
            }
          } else {
            // Webページの場合は、PDF化する
            const pdf = await page.pdf({
              // paperWidth: 33.1,
              // paperHeight: 46.8,
              format: 'A0',
            });
            Deno.writeFileSync(path, pdf);
          }
          await browser.close();
        })(),
        c.signal,
      );

      console.log('Success createPDF');
      clearTimeout(timer);
      return;
    } catch (e) {
      console.error(e);
      if (browser) {
        await browser.close();
      }

      if (retryCount >= 5) {
        console.log('Failed createPDF');
        return;
      }

      // リトライ処理
      console.log(`Retry createPDF`);
      await retry(retryCount + 1);
      return;
    }
  };
  await retry();
  return;
};
