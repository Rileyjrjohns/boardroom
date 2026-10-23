import fs from 'node:fs';
import path from 'node:path';

import { FEATURE_GRAPH, findCycle, graphProblems } from './featureGraph.mjs';

// The graph of the features (tooling/featureGraph.mjs) is what the linter turns into the rules
// that keep the features apart. It must say the truth about the folders of src/features, and it must
// not close a cycle: when two features need each other, one of them declares a port that the
// composition wires (docs/architecture.md, "Inversions"). tooling/lint-rules.test.ts checks what
// the linter does with it.

const ROOT = path.resolve(__dirname, '..');
const FEATURES_FOLDER = path.join(ROOT, 'src', 'features');

const featureFolders = fs
  .readdirSync(FEATURES_FOLDER, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('the graph of the features', () => {
  it('lists every folder of src/features, and nothing else', () => {
    expect(Object.keys(FEATURE_GRAPH).sort()).toEqual(featureFolders);
  });

  it('names only features, and none depends on itself', () => {
    const features = Object.keys(FEATURE_GRAPH);

    for (const [feature, dependencies] of Object.entries(FEATURE_GRAPH)) {
      for (const dependency of Object.keys(dependencies)) {
        expect(features).toContain(dependency);
        expect(dependency).not.toBe(feature);
      }
    }
  });

  it('has no cycle', () => {
    expect(findCycle(FEATURE_GRAPH)).toBeUndefined();
    expect(graphProblems(FEATURE_GRAPH)).toEqual([]);
  });

  it('says why each edge exists', () => {
    const reasons = Object.values(FEATURE_GRAPH).flatMap((dependencies) =>
      Object.values(dependencies),
    );

    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) expect(reason.trim().length).toBeGreaterThan(20);
  });

  it('is the graph of docs/architecture.md: auth depends on nothing, meetings on auth, documents and votes on both', () => {
    const edges = Object.fromEntries(
      Object.entries(FEATURE_GRAPH).map(([feature, dependencies]) => [
        feature,
        Object.keys(dependencies).sort(),
      ]),
    );

    expect(edges).toEqual({
      auth: [],
      meetings: ['auth'],
      documents: ['auth', 'meetings'],
      votes: ['auth', 'meetings'],
    });
  });
});

describe('findCycle', () => {
  it('finds the cycle a graph closes, from the feature that opens it', () => {
    expect(findCycle({ a: { b: 'x' }, b: { a: 'x' } })).toEqual(['a', 'b', 'a']);
    expect(findCycle({ a: {}, b: { c: 'x' }, c: { d: 'x' }, d: { b: 'x' } })).toEqual([
      'b',
      'c',
      'd',
      'b',
    ]);
  });

  it('finds none in a graph that only shares a dependency', () => {
    expect(findCycle({ a: {}, b: { a: 'x' }, c: { a: 'x', b: 'x' } })).toBeUndefined();
  });
});

describe('graphProblems', () => {
  it('reports an edge to something that is no feature, a feature that depends on itself, and a cycle', () => {
    expect(graphProblems({ a: { nothing: 'x' } })).toEqual([
      'a depends on nothing, which is no feature of the graph.',
    ]);
    expect(graphProblems({ a: { a: 'x' } })).toEqual([
      'a depends on itself.',
      'The graph has a cycle: a -> a.',
    ]);
    expect(graphProblems({ a: { b: 'x' }, b: { a: 'x' } })).toEqual([
      'The graph has a cycle: a -> b -> a.',
    ]);
  });
});
