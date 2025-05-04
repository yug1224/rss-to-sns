import defaultsGraphemer from 'npm:graphemer';
const Graphemer = defaultsGraphemer.default;
const graphemeSplitter = new Graphemer();

interface Item {
  links: { href?: string }[];
  published?: string;
  title?: { value?: string };
  description?: { value?: string };
  id: string;
}

// deno-lint-ignore require-await
export default async (item: Item, summary?: string) => {
  const link: string = item.links[0].href || '';
  const title: string = item.title?.value || '';

  // X用のテキストを作成
  console.log('Success createXProps');

  let xText = '';
  if (summary) {
    xText = `${summary}\n${link}`;
  } else if (title) {
    const countTitleText = graphemeSplitter.countGraphemes(title);
    const displayTitleText = countTitleText > 100
      ? graphemeSplitter.splitGraphemes(title).slice(0, 96).join('') + '...'
      : title;

    xText = `${displayTitleText}\n${link}`;
  } else {
    xText = link;
  }

  return { xText };
};
