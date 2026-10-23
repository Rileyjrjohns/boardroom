# testing

Test support that serves several scopes: what a test of one feature cannot take from its own `testing` folder because it assembles more than one.

| Folder            | What                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/`         | `builders.ts`: the builders of the fixtures of the domain (a user, a meeting, a vote...) and the instant of the tests                                                                                                                                    |
| `application/`    | `createFakes` (with `withCaches`, which binds the purgers and the evictor to the caches a test uses), which assembles the fakes of every port for the tests of the use cases, and the tests of the fakes against the contract suites (`fakes.*.test.ts`) |
| `infrastructure/` | The HTTP world (`httpWorld`, `testServer`, `serverSetups`), the test database, and the stubs of the native modules that the Jest projects swap in                                                                                                        |
| `presentation/`   | The render helpers of the screens and of the whole app (`renderScreen`, `renderApp`, which wrap what the real composition wraps), the stand-in services, and the merged translation maps (`translationMaps`)                                             |

The test support that belongs to one scope is in the `testing` folder of its layer, next to the code it serves (`src/core/application/testing`, `src/features/<feature>/infrastructure/testing`...). The same rule applies to all of it: only tests and other test support import a `testing` folder, and production code that does fails the lint (the `@testing/*` alias included). Test support is not production code: it is out of the coverage figures, and a fixture there may throw.

The tests and the test support are out of the graph of the features (a test of the composition or a render helper assembles several), but they follow the rules of the layers.
