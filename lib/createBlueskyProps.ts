import defaultsGraphemer from 'npm:graphemer';
const Graphemer = defaultsGraphemer.default;
const graphemeSplitter = new Graphemer();

import AtprotoAPI, { AtpAgent } from 'npm:@atproto/api';
const { RichText } = AtprotoAPI;

interface Item {
  links: { href?: string }[];
  published?: string;
  title?: { value?: string };
  description?: { value?: string };
  id: string;
}

async function createRichTextForBluesky(
  agent: AtpAgent,
  link: string,
  title?: string,
  summary?: string,
): Promise<AtprotoAPI.RichText> {
  const { host, pathname } = new URL(link);
  const ellipsis = `...`;
  const countLinkText = graphemeSplitter.countGraphemes(`${host}${pathname}`);
  const displayLinkText = countLinkText > 30
    ? graphemeSplitter.splitGraphemes(`${host}${pathname}`).slice(0, 26).join('') + ellipsis
    : `${host}${pathname}`;

  let postBodyText = '';
  if (summary) {
    postBodyText = `${displayLinkText}\n${summary}`;
  } else if (title) {
    const countTitleText = graphemeSplitter.countGraphemes(title);
    const displayTitleText = countTitleText > 100
      ? graphemeSplitter.splitGraphemes(title).slice(0, 96).join('') + ellipsis
      : title;

    postBodyText = `${displayLinkText}\n${displayTitleText}`;
  } else {
    postBodyText = displayLinkText;
  }

  const richText = new RichText({ text: postBodyText });
  await richText.detectFacets(agent);
  richText.facets = [
    {
      index: {
        byteStart: 0,
        byteEnd: new TextEncoder().encode(displayLinkText).length,
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#link',
          uri: link,
        },
      ],
    },
    ...(richText.facets || []),
  ];

  return richText;
}

export default async (agent: AtpAgent, item: Item, summary?: string) => {
  const title: string = (item.title?.value || '').trim();
  const description: string = (item.description?.value || '').trim();
  const link: string = item.links[0].href || '';

  const bskyText = await createRichTextForBluesky(agent, link, title, summary);

  console.log('Success createBlueskyProps');
  return { bskyText, title, link, description };
};
