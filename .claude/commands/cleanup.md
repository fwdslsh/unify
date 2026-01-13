lets do a final pass to simplify this code base and get it ready for a production release. this means the code 
  should be free of unneccessary code/complexity. Naming conventions should be followed. All bun specific could 
  should be moved into the implementation classes to reduce complexity. for example bun-file-watcher and 
  file-watcher should be merged into a single file-watcher module. make the code as streamlined as possible without 
  breaking or removing any functionality or breaking the builds. reference app-spec.md to ensure the final solution 
  is 100% compliant. ensure all tests pass. ensure all bun specific naming is removed  and bun specific code has be 
  merged with the base implementation and all traces of multiple runtimes is removed. write a checklist of all of 
  the steps that need to be completed to final-refactor.md. then implement each change and update the document as 
  you go