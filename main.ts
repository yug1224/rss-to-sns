import 'jsr:@std/dotenv/load';
import { delay } from 'jsr:@std/async';
import * as path from 'jsr:@std/path';
import AtprotoAPI from 'npm:@atproto/api';
import createBlueskyProps from './lib/createBlueskyProps.ts';
import createPDF from './lib/createPDF.ts';
import createPDFSummary from './lib/createPDFSummary.ts';
import createXProps from './lib/createXProps.ts';
import createYouTubeSummary from './lib/createYouTubeSummary.ts';
import getItemList from './lib/getItemList.ts';
import getOgp from './lib/getOgp.ts';
import postBluesky from './lib/postBluesky.ts';
import postWebhook from './lib/postWebhook.ts';
import resizeImage from './lib/resizeImage.ts';

// フィードアイテムのインターフェース
interface Item {
  links: { href?: string }[];
  published?: string;
  title?: { value?: string };
  description?: { value?: string };
  id: string;
}

/**
 * 各フィードアイテムを処理する関数
 * @param {AtprotoAPI.AtpAgent} agent - Bluesky エージェント
 * @param {Item} item - 処理するフィードアイテム
 * @param {number} timestamp - タイムスタンプ
 */
async function processItem(
  agent: AtprotoAPI.AtpAgent,
  item: Item,
  timestamp: number,
) {
  const href = item.links[0].href || '';

  // OGP情報を取得
  let og: { ogTitle?: string; ogDescription?: string; ogImage?: { url: string }[] } = {};
  if (href.endsWith('.pdf')) {
    // PDFの場合はファイル名をタイトルとする
    og = { ogTitle: path.basename(href) };
  } else {
    og = await getOgp(href);
  }

  // 要約を生成
  let summary = '';
  if (href.startsWith('https://www.youtube.com')) {
    summary = await createYouTubeSummary(href);
  }
  if (
    ![
      'https://anond.hatelabo.jp/',
      'https://art19.com',
      'https://creators.spotify.com',
      'https://pivotmedia.co.jp',
      'https://www.youtube.com',
      'https://yug1224.hatenablog.jp',
    ].some((url) => href.startsWith(url))
  ) {
    const pdfPath = `${timestamp}.pdf`;
    await createPDF(href, pdfPath);

    let fileInfo;
    try {
      fileInfo = await Deno.stat(pdfPath);
    } catch {
      console.log('file not found');
    }
    // PDFファイルサイズが40MB未満の場合のみ要約を作成
    if (fileInfo && fileInfo.size < 40 * 1024 * 1024) {
      summary = await createPDFSummary(pdfPath);
    }
  }

  // Bluesky および X 投稿用のデータを準備
  const tmpItem = {
    ...item,
    title: { value: og.ogTitle || item.title?.value || '' },
    description: {
      value: og.ogDescription || item.description?.value || '',
    },
  };
  const { bskyText, title, link, description } = await createBlueskyProps(
    agent,
    tmpItem as Item,
    summary,
  );
  const { xText } = await createXProps(tmpItem as Item, summary);

  // OGP画像をリサイズ
  const { mimeType, resizedImage } = await (async () => {
    const ogImage = og.ogImage?.at(0);
    if (!ogImage) {
      console.log('ogp image not found');
      return {};
    }

    const { href, hostname } = new URL(ogImage.url, link);

    // プライベートIPアドレスの場合は処理をスキップ
    if (/^(10|172\.16|192\.168)\./.test(hostname)) {
      console.log('private ip address');
      return {};
    }

    return await resizeImage(href, timestamp);
  })();

  // Bluesky に投稿
  await postBluesky({
    agent,
    rt: bskyText,
    title,
    link,
    description,
    mimeType,
    image: resizedImage,
  });

  // Webhook を送信 (Xへの投稿)
  await postWebhook(xText);
}

/**
 * メイン関数
 */
async function main() {
  let cnt = 0;
  let currentItem: Item | undefined;
  let itemList: Item[] | undefined;

  try {
    // フィードアイテムリストを取得
    itemList = await getItemList();

    console.log('itemList.length', itemList.length);
    console.log('itemList', JSON.stringify(itemList, null, 2));
    if (!itemList.length) {
      console.log('not found feed item');
      Deno.exit(0);
    }

    // 投稿対象の時間帯か確認 (UTC時間で1時から15時の間)
    const nowHour = new Date().getUTCHours();
    if (!(nowHour >= 1 && nowHour < 15)) {
      console.log(`${nowHour}:00 is not target time`);
      Deno.exit(0);
    }

    // Bluesky エージェントを初期化
    const { BskyAgent } = AtprotoAPI;
    const service = 'https://bsky.social';
    const agent = new BskyAgent({ service });
    const identifier = Deno.env.get('BLUESKY_IDENTIFIER') || '';
    const password = Deno.env.get('BLUESKY_PASSWORD') || '';
    await agent.login({ identifier, password });

    // 10分間のタイムアウトを設定
    setTimeout(() => {
      throw new Error('Timeout main');
    }, 1000 * 60 * 10);

    // 各アイテムを処理
    for await (const item of itemList) {
      cnt++;
      // 投稿数が3件を超えたら終了
      if (cnt > 3) {
        console.log('post count over');
        break;
      }

      currentItem = item;

      // タイムスタンプをファイルに書き込む
      const timestamp = item.published ? new Date(item.published).getTime() : new Date().getTime();
      await Deno.writeTextFile('.timestamp', timestamp.toString());
      await Deno.writeTextFile(
        '.itemList.json',
        JSON.stringify(itemList.slice(cnt)),
      );

      // アイテムを処理
      await processItem(agent, item, timestamp);

      console.log('wait 15 seconds');
      await delay(1000 * 15); // 15秒待機
    }

    console.log('Success main');
    Deno.exit(0);
  } catch (e: unknown) {
    // エラーが発生した場合、処理中のアイテムと残りのアイテムリストをファイルに保存
    if (currentItem && itemList) {
      await Deno.writeTextFile(
        '.itemList.json',
        JSON.stringify([...itemList.slice(cnt), {
          ...currentItem,
          published: itemList?.at(-1)?.published || currentItem?.published,
        }]),
      );
    }

    // エラー情報を出力
    if (e instanceof Error) {
      console.error(e.stack);
    }
    console.error(JSON.stringify(e, null, 2));
    Deno.exit(1);
  }
}

// メイン関数を実行
main();
