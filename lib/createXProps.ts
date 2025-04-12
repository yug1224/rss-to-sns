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

  // X用のテキストを作成
  console.log('Success createXProps');

  let xText = '';
  if (summary) {
    xText = `${summary}\n${link}`;
  } else if (item.title?.value) {
    xText = `${item.title.value}\n${link}`;
  } else {
    xText = link;
  }

  return { xText };
};
