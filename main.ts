import 'jsr:@std/dotenv/load';
import { delay } from 'jsr:@std/async';
import AtprotoAPI from 'npm:@atproto/api';
import createBlueskyProps from './lib/createBlueskyProps.ts';
import createXProps from './lib/createXProps.ts';
import createPDF from './lib/createPDF.ts';
import createSummary from './lib/createSummary.ts';
import getItemList from './lib/getItemList.ts';
import getOgp from './lib/getOgp.ts';
import postBluesky from './lib/postBluesky.ts';
import postWebhook from './lib/postWebhook.ts';
import resizeImage from './lib/resizeImage.ts';

let cnt = 0, currentItem, itemList;
try {
  // rss feedから記事リストを取得
  itemList = await getItemList();

  // 対象がなかったら終了
  console.log('itemList.length', itemList.length);
  console.log('itemList', JSON.stringify(itemList, null, 2));
  if (!itemList.length) {
    console.log('not found feed item');
    Deno.exit(0);
  }

  // UTC:01-15時の間のみ実行（JST:10-24時の間のみ実行）
  const nowHour = new Date().getUTCHours();
  if (!(nowHour >= 1 && nowHour < 15)) {
    console.log(`${nowHour}:00 is not target time`);
    Deno.exit(0);
  }

  // Blueskyにログイン
  const { BskyAgent } = AtprotoAPI;
  const service = 'https://bsky.social';
  const agent = new BskyAgent({ service });
  const identifier = Deno.env.get('BLUESKY_IDENTIFIER') || '';
  const password = Deno.env.get('BLUESKY_PASSWORD') || '';
  await agent.login({ identifier, password });

  // 10分後に処理を終了させる
  setTimeout(() => {
    throw new Error('Timeout main');
  }, 1000 * 60 * 10);

  // 取得した記事リストをループ処理
  for await (const item of itemList) {
    // 投稿回数をカウントし、3件以上投稿したら終了
    cnt++;
    if (cnt > 3) {
      console.log('post count over');
      break;
    }

    currentItem = item;

    // 最終実行時間を更新
    const timestamp = item.published ? new Date(item.published).getTime() : new Date().getTime();
    await Deno.writeTextFile('.timestamp', timestamp.toString());

    // 記事リストを更新
    await Deno.writeTextFile(
      '.itemList.json',
      JSON.stringify(itemList.slice(cnt)),
    );

    const href = item.links[0].href || '';

    // URLからOGPの取得
    const og = await getOgp(href);
    let summary;
    if (
      [
        'https://anond.hatelabo.jp/',
        'https://art19.com',
        'https://creators.spotify.com',
        'https://pivotmedia.co.jp',
        'https://www.youtube.com',
        'https://yug1224.hatenablog.jp',
      ].some((url) => href.startsWith(url))
    ) {
      // 動画や音声コンテンツ系はスキップ
      console.log('Skip createPDF');
    } else {
      const path = `${timestamp}.pdf`;

      // WebページをPDF化
      await createPDF(href, path);

      // ファイルサイズが40MB以下の場合のみ要約を作成する
      const fileInfo = await Deno.stat(path);
      if (fileInfo.size < 40 * 1024 * 1024) {
        // Gemini APIで要約
        summary = await createSummary(path);
      }
    }

    // 投稿記事のプロパティを作成
    const tmpItem = {
      ...item,
      title: { value: og.ogTitle || item.title?.value || '' },
      description: {
        value: og.ogDescription || item.description?.value || '',
      },
    };
    const { bskyText, title, link, description } = await createBlueskyProps(
      agent,
      tmpItem,
      summary,
    );
    const { xText } = await createXProps(tmpItem);

    // 画像のリサイズ
    const { mimeType, resizedImage } = await (async () => {
      const ogImage = og.ogImage?.at(0);
      if (!ogImage) {
        console.log('ogp image not found');
        return {};
      }
      return await resizeImage(new URL(ogImage.url, link).href);
    })();

    // Blueskyに投稿
    await postBluesky({
      agent,
      rt: bskyText,
      title,
      link,
      description,
      mimeType,
      image: resizedImage,
    });

    // IFTTTを使ってXに投稿
    await postWebhook(xText);

    // 15秒待つ
    console.log('wait 15 seconds');
    await delay(1000 * 15);
  }

  console.log('Success main');
  // 終了
  Deno.exit(0);
} catch (e) {
  // エラーが発生した記事をリストの最後に追加して保存する
  if (currentItem && itemList) {
    await Deno.writeTextFile(
      '.itemList.json',
      JSON.stringify([...itemList.slice(cnt), {
        ...currentItem,
        published: itemList.at(-1)?.published || currentItem.published,
      }]),
    );
  }

  // エラーが発生したらログを出力して終了
  console.error(e.stack);
  console.error(JSON.stringify(e, null, 2));
  Deno.exit(1);
}
