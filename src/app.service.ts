import { Injectable } from '@nestjs/common';
//import { OpenGraph } from './components/opengraph';

//import { renderToString } from 'react-dom/server';

@Injectable()
export class AppService {
  htmlOpenGraph(
    type: string,
    url: string,
    thumbnail?: string,
    title?: string,
    description?: string,
    width?: number,
    height?: number,
  ): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:url" content="${url}" />
        <meta property="og:type" content="${type}" />
        <meta property="og:title" content="${title ?? ''}" />
        <meta property="og:description" content="${description ?? ''}" />
        <meta property="og:image" content="${
          thumbnail ?? process.env.DEFAULT_THUMBNAIL_URL
        }" />
        <meta property="og:image:width" content="${width ?? ''}" />
        <meta property="og:image:height" content="${height ?? ''}" />
      </head>
    </html>
    `;
  }
  getContent(): string {
    return 'hello world';
  }
}
