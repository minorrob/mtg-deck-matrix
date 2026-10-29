/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Unapplied Play-lane proposal. Only a browser fixture may serve these bytes before ownership approval. */
export const replacements=[
 ['top ? card(top) : drawing',`top ? (drawing ? card(top, {action: "board-draw"}).replace('aria-label="', 'aria-label="Draw card: ') : card(top)) : drawing`],
 ['pile("Library", z.Library, null, {back: true, draw:','pile("Library", z.Library, z.Library.cards[0], {back: true, draw:']
];
export function candidateBoard(source){
 for(const [before,after]of replacements){if(source.split(before).length!==2)throw new Error("The proposed Snoop renderer anchor changed; review it before applying.");source=source.replace(before,after);}
 return source;
}
