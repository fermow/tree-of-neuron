const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
for (const file of ["assets/data.js", "assets/research.js", "assets/terms.js", "assets/graph.js", "assets/visuals.js", "assets/media.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const { events, eras, references } = context.window.NEURON_HISTORY;
const research = context.window.NEURON_RESEARCH;
const terminology = context.window.NEURON_TERMS;
const graph = context.window.NEURON_GRAPH;
const visuals = context.window.NEURON_VISUALS;
const detailCode = fs.readFileSync("assets/event.js", "utf8");
const termCode = fs.readFileSync("assets/term.js", "utf8");
const ids = new Set();
const eraIds = new Set(eras.map(era => era.id));
for (const [index, event] of events.entries()) {
  if (ids.has(event.id)) throw new Error(`Duplicate event id: ${event.id}`);
  ids.add(event.id);
  if (index && events[index - 1].sort > event.sort) throw new Error(`Out of order: ${event.id}`);
  if (!eraIds.has(event.era)) throw new Error(`Unknown research thread: ${event.id}`);
  if (!research[event.id]) throw new Error(`Missing historical analysis: ${event.id}`);
  if (visuals.scenes[event.id]?.length !== 4) throw new Error(`Missing visual sequence: ${event.id}`);
  if (!event.refs.length || event.refs.some(id => !references[id])) throw new Error(`Missing reference: ${event.id}`);
  for (const field of ["kind", "strength", "background", "procedure", "answer", "caution", "source"]) {
    if (!research[event.id][field]?.trim()) throw new Error(`Missing ${field}: ${event.id}`);
  }
  const root = { innerHTML: "", querySelector: () => null };
  const page = {
    window: { NEURON_HISTORY: context.window.NEURON_HISTORY, NEURON_RESEARCH: research, NEURON_TERMS: terminology, NEURON_VISUALS: visuals, NEURON_GRAPH: graph, NEURON_MEDIA: context.window.NEURON_MEDIA, location: { search: `?id=${encodeURIComponent(event.id)}` } },
    document: { getElementById: () => root, documentElement: { style: { setProperty() {} } }, title: "" },
    URLSearchParams
  };
  vm.runInNewContext(detailCode, page, { filename: "assets/event.js" });
  if (!["Why did this question arise?", "What the sources describe", "How certain is this conclusion?", "Source trail"].every(label => root.innerHTML.includes(label))) {
    throw new Error(`Incomplete detail page: ${event.id}`);
  }
  if (!root.innerHTML.includes("THE IDEA AT A GLANCE")) throw new Error(`Missing evidence sketch: ${event.id}`);
}
for (const [id, image] of Object.entries(visuals.archive)) {
  if (!ids.has(id) || !image.file || !image.credit || !image.caption) throw new Error(`Incomplete archival image: ${id}`);
}
for (const id of Object.keys(research)) if (!ids.has(id)) throw new Error(`Unknown research entry: ${id}`);
const termIds = new Set();
for (const term of terminology.items) {
  if (termIds.has(term.id)) throw new Error(`Duplicate terminology id: ${term.id}`);
  termIds.add(term.id);
  if (!ids.has(term.anchor)) throw new Error(`Unknown terminology anchor: ${term.id}`);
  if (!Number.isFinite(term.x) || !Number.isFinite(term.y)) throw new Error(`Missing map position: ${term.id}`);
  if (!term.lineage?.length || !term.refs?.length || term.refs.some(ref => !terminology.references[ref])) throw new Error(`Incomplete word history: ${term.id}`);
  const root = { innerHTML: "" };
  const back = { href: "" };
  const page = {
    window: { NEURON_HISTORY: context.window.NEURON_HISTORY, NEURON_TERMS: terminology, NEURON_MEDIA: context.window.NEURON_MEDIA, location: { search: `?id=${encodeURIComponent(term.id)}` } },
    document: { getElementById: name => name === "termBack" ? back : root, documentElement: { style: { setProperty() {} } }, title: "" },
    URLSearchParams
  };
  vm.runInNewContext(termCode, page, { filename: "assets/term.js" });
  if (!["Where did the word come from?", "Names across the periods", "References"].every(label => root.innerHTML.includes(label))) throw new Error(`Incomplete word page: ${term.id}`);
}
for (const term of terminology.items) for (const related of term.related) if (!termIds.has(related)) throw new Error(`Broken word cross-link: ${term.id} → ${related}`);
const byId = Object.fromEntries(events.map(event => [event.id, event]));
const edges = graph.strands.flatMap(strand => strand.links).concat(graph.bridges);
const osmoticPath = ["nollet-osmosis", "dutrochet-osmosis", "nageli-cramer", "pfeffer-membrane", "overton"];
for (let i = 1; i < osmoticPath.length; i++) {
  if (!edges.some(([from, to]) => from === osmoticPath[i - 1] && to === osmoticPath[i])) {
    throw new Error(`Broken osmosis pathway: ${osmoticPath[i - 1]} → ${osmoticPath[i]}`);
  }
}
for (const path of [["virchow-myelin", "ranvier-nodes", "lillie-model", "tasaki-saltatory", "huxley-stampfli", "myelin-wave-1952"], ["rio-oligodendrocytes", "bunge-central"], ["ben-geren", "bunge-central"]]) {
  for (let i = 1; i < path.length; i++) {
    if (!edges.some(([from, to]) => from === path[i - 1] && to === path[i])) throw new Error(`Broken myelin pathway: ${path[i - 1]} → ${path[i]}`);
  }
}
for (const id of ["medullary-sheath", "myelin-1854", "ranvier-node", "saltatory-conduction"]) {
  if (!termIds.has(id)) throw new Error(`Missing myelin terminology history: ${id}`);
}
if (!edges.some(([from,to]) => from === "hodgkin-huxley-1952" && to === "myelin-wave-1952")) throw new Error("Missing 1952 conceptual bridge");
for (const [from, to] of [["du-bois-reymond", "bernstein-rheotome"], ["bernstein-rheotome", "bernstein"], ["nernst", "bernstein"], ["overton", "bernstein"]]) {
  if (!edges.some(edge => edge[0] === from && edge[1] === to)) throw new Error(`Broken Bernstein synthesis: ${from} → ${to}`);
}
if (byId["bernstein"].date.includes("1868")) throw new Error("Rheotome and membrane model have been conflated");
for (const strand of graph.strands) if (!eraIds.has(strand.color)) throw new Error(`Unknown graph category: ${strand.id}`);
for (const [from, to] of edges) {
  if (!byId[from] || !byId[to]) throw new Error(`Broken graph connection: ${from} → ${to}`);
  if (byId[from].sort > byId[to].sort) throw new Error(`Backwards graph connection: ${from} → ${to}`);
}
if (!byId[graph.fork.join]) throw new Error("Missing fork convergence event");
for (const id of graph.fork.branches) {
  if (!byId[id] || byId[id].sort >= byId[graph.fork.join].sort) throw new Error(`Invalid parallel research branch: ${id}`);
}
if (new Set(graph.fork.branches.map(id => byId[id].sort)).size !== graph.fork.branches.length) throw new Error("Parallel branches have duplicate chronological positions");
for (const id of Object.keys(graph.positions).concat(Object.keys(graph.topics), Object.keys(graph.colors))) if (!byId[id]) throw new Error(`Unknown graph position, topic or color: ${id}`);
console.log(`${events.length} events and ${terminology.items.length} word histories have complete detail pages and valid references.`);
