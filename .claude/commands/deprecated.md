read the  .planss/deprecated.md document loop through each action in the document and    │
│   complete it. THINK VERY HARD about the correct changes to make based on the action       │
│   description, related information in this document, the docs/app-spec.md, and the         │
│   related code/tests. Implement the changes, and add a status for that action in the       │
│   deprecated.md file. then move on to the next action and repeat this until all actions    │
│   are completed and their status is documented. once this is complete run a series of      │
│   tests to ensure all features defined in the app-spec continue to work. start with        │
│   running small groups of targeted tests. review the results, and if there are failures,   │
│   THINK HARD about how to correctly address the issue. add information about it to the     │
│   depracted.md file, correct the issue, and re-run the tests. continue this process until  │
│   all tests in that group pass. then move to the next group and repeat the process. once   │
│   all groups of unit tests pass, run the rull suite of tests and repeat the process of     │
│   reviewing the failed tests, documenting them, thinking about the issues, correcting the  │
│   issue, rerunning the specific test or group of tests, repeating this until those tests   │
│   pass, update the status in the deprecated.md file. then run the full test suite again    │
│   to ensure all tests pass. repeat this process until the entire test suite runs without   │
│   issues and all tests pass    