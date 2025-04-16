
## appendix 1 foundry machine interface

The foundry functional interface uses tools tool_calls and the "tool" role
when config.tools enabled with config option.

Only recent models provide tools interface, foundry should fall 
back to a no tools completion mode.

See the OpenAI API spec for more tool role details.

### read_time

### submit_file

### annotate_foundry

