Before choosing a verification strategy, query the documentation for the implementation area together with `testing`, for example `pnpm docs:find react testing` or `pnpm docs:find cli testing`.

Prefer tests that prove the changed policy or behavior at the narrowest stable boundary, then run the broader repository checks required for integration. Do not replace missing targeted coverage with a green broad suite when the defect can be tested directly.
