import 'https://deno.land/std@0.193.0/dotenv/load.ts';

import createProperties from './src/createProperties.ts';
import getItemList from './src/getItemList.ts';
import getOgp from './src/getOgp.ts';
import postBluesky from './src/postBluesky.ts';
import resizeImage from './src/resizeImage.ts';

// rss feedから記事リストを取得
const itemList = await getItemList();
console.log(JSON.stringify(itemList, null, 2));

// 対象がなかったら終了
if (!itemList.length) {
  console.log('not found feed item');
  Deno.exit(0);
}

// 取得した記事リストをループ処理
for await (const item of itemList) {
  // 最終実行時間を更新
  const timestamp = item.published
    ? new Date(item.published).toISOString()
    : new Date().toISOString();
  await Deno.writeTextFile('.timestamp', timestamp);

  // 投稿記事のプロパティを作成
  const { rt, link } = await createProperties(item);

  // URLからOGPの取得
  const og = await getOgp(link);

  // 画像のリサイズ
  const images = [];

  for (const ogImage of og.ogImage || []) {
    const { mimeType, resizedImage } = await resizeImage(
      new URL(ogImage.url, link).href
    );
    if (mimeType && resizedImage)
      images.push({ mimeType, image: resizedImage });
  }

  // Blueskyに投稿
  await postBluesky({
    rt,
    images,
  });
}
