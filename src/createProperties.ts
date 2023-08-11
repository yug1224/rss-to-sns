import { FeedEntry } from 'https://deno.land/x/rss@0.6.0/src/types/mod.ts';
import AtprotoAPI from 'npm:@atproto/api';
import defaultsGraphemer from 'npm:graphemer';

const Graphemer = defaultsGraphemer.default;
const splitter = new Graphemer();

const { BskyAgent, RichText } = AtprotoAPI;
const service = 'https://bsky.social';
const agent = new BskyAgent({ service });

export default async (item: FeedEntry) => {
  const title = item.title?.value || '';
  const link = item.links[0].href || '';

  let rt = new RichText({ text: title });
  await rt.detectFacets(agent);

  // URL部分を短縮
  let text = rt.text;
  let targets: { link: string }[] = [];
  rt.facets?.forEach((v) => {
    if (
      v.features[0]['$type'] === 'app.bsky.richtext.facet#link' &&
      typeof v.features[0].uri === 'string'
    ) {
      const link = v.features[0].uri;
      const key =
        splitter.countGraphemes(link) <= 27
          ? link
          : splitter.splitGraphemes(link).slice(0, 27).join('') + '...';
      text = text.replace(link, key);
      targets = [...targets, { link }];
    }
  });

  // 300文字を超える場合は、300文字になるように切り詰める
  const max = 300;
  const shortenedLink =
    splitter.countGraphemes(link) <= 27
      ? link
      : splitter.splitGraphemes(link).slice(0, 27).join('') + '...';
  targets = [...targets, { link }];
  const isOverLength =
    splitter.countGraphemes(text) >
    max - splitter.countGraphemes(`\n\n${shortenedLink}`);
  if (isOverLength) {
    const ellipsis = `...`;
    const cnt =
      max - splitter.countGraphemes(`${ellipsis}\n\n${shortenedLink}`);
    const shortenedText = splitter.splitGraphemes(text).slice(0, cnt).join('');
    text = `${shortenedText}${ellipsis}`;
  }
  // 本文の最後に短縮したURLを追加
  text = `${text}\n\n${shortenedLink}`;

  rt = new RichText({ text });
  await rt.detectFacets(agent);

  // 短縮したURLのリンク先を元のURLに置き換える
  const facets = rt.facets || [];
  facets.forEach((v, i) => {
    if (
      v.features[0]['$type'] === 'app.bsky.richtext.facet#link' &&
      typeof v.features[0].uri === 'string' &&
      targets[i]?.link
    ) {
      // 文字数超過の場合は、最後のリンクは元URLになるはず
      const uri =
        isOverLength && i === facets.length - 1 ? link : targets[i].link;
      v.features[0].uri = uri;
      v.index.byteEnd = v.index.byteStart + splitter.countGraphemes(uri);
    }
  });

  console.log('success createProperties');
  return { text: rt.text, facets, title, link };
};
