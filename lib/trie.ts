// Prefix trie for word completion suggestions.

import type { Suggester } from "./types";

class Node {
  children = new Map<string, Node>();
  isWord = false;
}

export class WordTrie implements Suggester {
  private root = new Node();

  constructor(words: string[] = []) {
    for (const w of words) this.insert(w);
  }

  insert(word: string): void {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return;
    let node = this.root;
    for (const ch of w) {
      let child = node.children.get(ch);
      if (!child) {
        child = new Node();
        node.children.set(ch, child);
      }
      node = child;
    }
    node.isWord = true;
  }

  knows(word: string): boolean {
    const w = word.toLowerCase();
    let node: Node | undefined = this.root;
    for (const ch of w) {
      node = node.children.get(ch);
      if (!node) return false;
    }
    return node.isWord;
  }

  suggest(prefix: string, max = 3): string[] {
    const p = prefix.toLowerCase().replace(/[^a-z]/g, "");
    if (!p) return [];
    let node: Node | undefined = this.root;
    for (const ch of p) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    // collect all words under this node
    const out: string[] = [];
    const walk = (n: Node, acc: string) => {
      if (out.length >= 64) return; // hard cap for perf
      if (n.isWord) out.push(acc);
      for (const [ch, child] of [...n.children.entries()].sort((a, b) =>
        a[0] < b[0] ? -1 : 1
      )) {
        walk(child, acc + ch);
      }
    };
    walk(node, p);
    // rank: length asc, then alphabetical
    out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    return out.slice(0, max);
  }
}

export function buildTrieFromText(text: string): WordTrie {
  const words = text.split(/[^A-Za-z]+/).filter(Boolean);
  return new WordTrie(words);
}
