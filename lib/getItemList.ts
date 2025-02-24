import { parseFeed } from 'jsr:@mikaelporttila/rss';

interface Item {
  links: { href?: string }[];
  published?: string;
  title?: { value?: string };
  description?: { value?: string };
  id: string;
}

const lastExecutionTime = await Deno.readTextFile('.timestamp');
console.log(lastExecutionTime.trim());

export default async () => {
  const RSS_URL = Deno.env.get('RSS_URL');
  if (!RSS_URL) {
    console.log('RSS_URL is not defined');
    return [];
  }

  const response = await fetch(RSS_URL);
  const xml = await response.text();
  const feed = await parseFeed(xml);

  // 前回残した記事リストを取得
  const lastItemList = await Deno.readTextFile('.itemList.json');
  const itemList: Item[] = lastItemList ? JSON.parse(lastItemList) : [];

  // 最終実行時間以降かつdescriptionがある記事を抽出
  // 前回残した記事リストと今回取得した記事リストをマージ
  feed.entries.reverse().map((item) => {
    if (
      item.published &&
      new Date(Number(lastExecutionTime.trim())) < new Date(item.published) &&
      itemList.findIndex((i) => i.id === item.id) === -1
    ) {
      itemList.push({
        ...item,
        published: item.published.toISOString(),
        id: item.id,
      });
    }
  });

  await Deno.writeTextFile('.itemList.json', JSON.stringify(itemList));
  console.log('Success getItemList');
  return itemList;
};
