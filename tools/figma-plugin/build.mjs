// Bundles src/code.ts (and the exporter mapping it imports) into dist/code.js for Figma.
// Figma's plugin sandbox is older than modern browsers: target ES2017 and rewrite BigInt literals
// (zod's int64 limits) into guarded BigInt() calls so the bundle parses and loads.
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

/** Globals Figma's plugin sandbox lacks but the bundle (zod) touches at load time. */
const sandboxPolyfills = `(function(g){
if(typeof g.TextEncoder==="undefined"){g.TextEncoder=function(){};g.TextEncoder.prototype.encode=function(s){s=String(s===undefined?"":s);var o=[];for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);if(c>=0xd800&&c<0xdc00&&i+1<s.length){var d=s.charCodeAt(i+1);if(d>=0xdc00&&d<0xe000){c=0x10000+((c-0xd800)<<10)+(d-0xdc00);i++;}}if(c<0x80)o.push(c);else if(c<0x800)o.push(0xc0|c>>6,0x80|c&63);else if(c<0x10000)o.push(0xe0|c>>12,0x80|c>>6&63,0x80|c&63);else o.push(0xf0|c>>18,0x80|c>>12&63,0x80|c>>6&63,0x80|c&63);}return new Uint8Array(o);};}
if(typeof g.TextDecoder==="undefined"){g.TextDecoder=function(){};g.TextDecoder.prototype.decode=function(b){if(!b)return"";var a=new Uint8Array(b.buffer||b),s="",i=0;while(i<a.length){var c=a[i++];if(c>=0xf0){c=(c&7)<<18|(a[i++]&63)<<12|(a[i++]&63)<<6|a[i++]&63;c-=0x10000;s+=String.fromCharCode(0xd800+(c>>10),0xdc00+(c&1023));}else if(c>=0xe0)s+=String.fromCharCode((c&15)<<12|(a[i++]&63)<<6|a[i++]&63);else if(c>=0xc0)s+=String.fromCharCode((c&31)<<6|a[i++]&63);else s+=String.fromCharCode(c);}return s;};}
})(typeof globalThis!=="undefined"?globalThis:this);`;

const outfile = new URL("./dist/code.js", import.meta.url).pathname;

/** Turns `123n` literals into calls that also survive a sandbox without BigInt. */
export function rewriteBigIntLiterals(code) {
  return code.replace(
    /(^|[^\w$."'`])(-?)(\d+)n(?![\w$])/g,
    (_m, pre, sign, digits) =>
      `${pre}(typeof BigInt=="function"?BigInt("${sign}${digits}"):${sign}${digits})`,
  );
}

/** @param {{ write?: boolean }} [opts] */
export async function buildPlugin(opts = {}) {
  const write = opts.write ?? true;
  const result = await build({
    entryPoints: [new URL("./src/code.ts", import.meta.url).pathname],
    bundle: true,
    format: "iife",
    target: "es2017",
    supported: { bigint: true },
    platform: "browser",
    outfile,
    write: false,
    logLevel: write ? "info" : "silent",
    legalComments: "none",
    banner: { js: sandboxPolyfills },
    minify: true,
  });
  const code = rewriteBigIntLiterals(result.outputFiles[0].text);
  if (write) await writeFile(outfile, code);
  return { ...result, code };
}

if (import.meta.url === `file://${process.argv[1]}`) await buildPlugin();
