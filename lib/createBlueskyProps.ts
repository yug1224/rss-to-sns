import defaultsGraphemer from 'npm:graphemer';
const Graphemer = defaultsGraphemer.default;
const splitter = new Graphemer();

import AtprotoAPI, { AtpAgent } from 'npm:@atproto/api';
const { RichText } = AtprotoAPI;

interface Item {
  links: { href?: string }[];
  published?: string;
  title?: { value?: string };
  description?: { value?: string };
  id: string;
}

export default async (agent: AtpAgent, item: Item, summary?: string) => {
  const title: string = (item.title?.value || '').trim();
  const description: string = (item.description?.value || '').trim();
  const link: string = item.links[0].href || '';

  // Bluesky用のテキストを作成
  const bskyText = await (async () => {
    const { host, pathname } = new URL(link);
    const ellipsis = `...`;
    const key = splitter.splitGraphemes(`${host}${pathname}`).slice(0, 28).join('') + ellipsis;
    let text = '';

    if (summary) {
      text = `${key}\n${summary}`;
    } else if (title) {
      text = `${key}\n${title}`;
    } else {
      text = key;
    }

    const rt = new RichText({ text });
    await rt.detectFacets(agent);
    rt.facets = [
      {
        index: {
          byteStart: 0,
          byteEnd: splitter.countGraphemes(key),
        },
        features: [
          {
            $type: 'app.bsky.richtext.facet#link',
            uri: link,
          },
        ],
      },
      ...(rt.facets || []),
    ];
    return rt;
  })();

  console.log('Success createBlueskyProps');
  return { bskyText, title, link, description };
};
