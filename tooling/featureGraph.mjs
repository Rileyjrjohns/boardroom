// The graph of the features: which feature may import which. It is read by the linter
// (eslint.config.mjs), which turns it into dependency policies, and by tooling/featureGraph.test.ts,
// which checks that it is acyclic and lists every folder of src/features.
//
// The rule it states is the one of docs/architecture.md ("The features"):
//
// - an edge is "may import": the importing feature may import the domain, the application and the
//   presentation of the other, never its infrastructure (an adapter is chosen by the composition);
// - the core imports no feature and not the composition; a feature never imports the composition;
// - the graph has no cycle. When a feature needs something of one that the graph does not allow it
//   to import, it does not add an edge that would close a cycle, and it does not move the thing to
//   the core to dodge it: the feature that owns the rule declares the port (or the slot, or the
//   context) it needs, another feature implements it, and only src/composition wires them.
//
// To add a dependency between two features, add the edge here with the reason.

/**
 * What the graph is made of: for each feature, the features it may import, each with the reason.
 * @typedef {Readonly<Record<string, Readonly<Record<string, string>>>>} FeatureGraph
 */

/** @type {FeatureGraph} */
export const FEATURE_GRAPH = {
  // The account and the session depend on nothing but the core: the others ask them who the user
  // is, never the other way round. What a session leaves on the device is purged through the
  // `SessionDataPurger` port, which the features implement.
  auth: {},
  meetings: {
    // A meeting is read for the signed-in user.
    auth:
      'a meeting is read for the signed-in user: the session guard (`requireSession`), the user ids ' +
      'of its participants, and the access state its screens follow',
  },
  documents: {
    // A document is opened for the signed-in user, and its watermark carries who they are.
    auth:
      'a document is opened for the signed-in user, and its watermark carries the name and the ' +
      'email of that `User`',
    // The Document is an entity of the meetings, which list them.
    meetings:
      'the `Document` is an entity of the meetings, which list them: the documents implement the ' +
      '`MeetingDocumentEvictor` port of the meetings, and the screen of a document reuses their ' +
      'badge tones',
  },
  votes: {
    // A vote is cast by the signed-in user.
    auth:
      'a vote is cast by the signed-in user, after the session guard and the biometric ' +
      'confirmation, and the votes follow the access state of the app',
    // A vote is cast on a resolution of a meeting.
    meetings:
      'a vote is cast on a resolution of a meeting: the `Meeting`, its `Resolution` and the ' +
      '`VoteChoice` belong to the meetings, whose resolutions the votes plug their actions into',
  },
};

/**
 * A cycle of the graph, as the list of features that closes it (`['a', 'b', 'a']`), or undefined
 * when there is none.
 * @param {FeatureGraph} graph
 * @returns {string[] | undefined}
 */
export function findCycle(graph) {
  /** @type {Map<string, 'visiting' | 'done'>} */
  const state = new Map();
  /** @type {string[]} */
  const path = [];

  /**
   * @param {string} feature
   * @returns {string[] | undefined}
   */
  function visit(feature) {
    if (state.get(feature) === 'done') return undefined;
    if (state.get(feature) === 'visiting') {
      return [...path.slice(path.indexOf(feature)), feature];
    }
    state.set(feature, 'visiting');
    path.push(feature);
    for (const dependency of Object.keys(graph[feature] ?? {})) {
      const cycle = visit(dependency);
      if (cycle !== undefined) return cycle;
    }
    path.pop();
    state.set(feature, 'done');
    return undefined;
  }

  for (const feature of Object.keys(graph)) {
    const cycle = visit(feature);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

/**
 * What is wrong with a graph, one sentence each: an edge to something that is no feature, a feature
 * that depends on itself, a cycle. A graph with none of them can be turned into policies.
 * @param {FeatureGraph} graph
 * @returns {string[]}
 */
export function graphProblems(graph) {
  const features = Object.keys(graph);
  /** @type {string[]} */
  const problems = [];
  for (const [feature, dependencies] of Object.entries(graph)) {
    for (const dependency of Object.keys(dependencies)) {
      if (dependency === feature) problems.push(`${feature} depends on itself.`);
      else if (!features.includes(dependency)) {
        problems.push(`${feature} depends on ${dependency}, which is no feature of the graph.`);
      }
    }
  }
  const cycle = findCycle(graph);
  if (cycle !== undefined) problems.push(`The graph has a cycle: ${cycle.join(' -> ')}.`);
  return problems;
}

/**
 * The dependency policies of the features, for eslint-plugin-boundaries. They read the capture
 * group `feature` of the elements (`src/features/<feature>/<layer>`), and say, for each feature of
 * the graph:
 *
 * - it imports no feature but the ones the graph names for it;
 * - it never imports the infrastructure of another feature, whatever the graph says.
 *
 * Then, for everybody: the core imports no feature and not the composition, and a feature never
 * imports the composition. A later policy wins over an earlier one, and a `disallow` over an
 * `allow` of the same policy, so these come after the policies of the layers.
 * @param {FeatureGraph} graph
 * @returns {object[]}
 * @throws {Error} when the graph is not valid (see `graphProblems`).
 */
export function featureGraphPolicies(graph) {
  const problems = graphProblems(graph);
  if (problems.length > 0) {
    throw new Error(`The graph of the features is not valid:\n- ${problems.join('\n- ')}`);
  }

  /** @param {string} feature */
  const fromFeature = (feature) => ({ element: { types: 'feature', captured: { feature } } });
  const perFeature = Object.entries(graph).flatMap(([feature, dependencies]) => {
    const allowed = Object.keys(dependencies);
    return [
      {
        from: fromFeature(feature),
        disallow: {
          to: {
            element: {
              types: 'feature',
              captured: { feature: `!(${[feature, ...allowed].join('|')})` },
            },
          },
        },
        message:
          allowed.length === 0
            ? `The feature ${feature} imports no other feature (FEATURE_GRAPH in tooling/featureGraph.mjs): when it needs something of one, it declares a port that the composition wires.`
            : `The feature ${feature} may import ${allowed.join(', ')} and no other feature (FEATURE_GRAPH in tooling/featureGraph.mjs): when it needs something of another, it declares a port that the composition wires.`,
      },
      {
        from: fromFeature(feature),
        disallow: {
          to: { element: { type: 'infrastructure', captured: { feature: `!${feature}` } } },
        },
        message:
          'A feature never imports the infrastructure of another feature: an adapter is chosen by the composition, and reached through a port.',
      },
    ];
  });

  return [
    ...perFeature,
    {
      from: { element: { types: 'core' } },
      disallow: { to: { element: { types: ['feature', 'composition'] } } },
      message:
        'The core imports no feature and not the composition: it holds what the features share and none owns. A rule of a feature does not go in the core to dodge a cycle: the feature that owns it declares the port it needs.',
    },
    {
      from: { element: { types: 'feature' } },
      disallow: { to: { element: { types: 'composition' } } },
      message:
        'A feature never imports the composition: the composition imports the features, and hands them what they declare they need.',
    },
  ];
}
