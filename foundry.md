# nitrologic foundry research tool

A research tool designed to chat and share files with models under test.

Timestamps in some file names is hex seconds since 1.1.1970.

## foundry user interface

commands with no arguments may often prompt for a # index from
the items displayed

### /config

Toggle configuration flags.

Adjust settings to suit current preferences.

Default values are typically:

* 0 commitonstart : commit shared files on start : true
* 1 tools : enable model tool interface : false
* 2 ansi : markdown ANSI rendering : true
* 3 slow : output at reading speed : true
* 4 verbose : emit debug information : false
* 5 broken : ansi background blocks : false
* 6 logging : log all output to file : true
* 7 resetcounters : factory reset when reset : false
* 8 returntopush : experimental hit return to /push : false
* 9 disorder : dangerous dos derangement : false

### /share

Share a file or folder with optional tag.

Files are added to the share list used by the /push /commit command.

### /drop

Drop all files currently shared, reduce the context and save tokens.

### /push /commit

Refresh shared files. 

Detects changes or deletions and updates the chat history.

Posts new versions of file content if modified.

### /reset

Clear all shared files and conversation history.

### /history

List a summary of recent conversation entries. 

Provides a quick overview of chat history.

### /cd

Change the working directory. 

User can navigate to a desired directory for file operations.

### /dir

List the contents of the current working directory. 

Helps user view available files and folders to share.

### /model

Select an AI model.

User can choose a model by name or index from the accounts available.


### /note

Attach a note to the current model under test.

Annotate the model under test with notes and observations.

### /tag

Describe all tags in use.

Displays tag name, count of shares tagged and description.

### /counter

List the internal application counters.

### /credit

Display current account information.

Select an account to adjust credits or view details.

### /forge

List all artifacts saved to the forge directory.

Select file to request Operating System open.

### /save [name]

Save the current conversation history. 

Creates a snapshot file of the conversation in the forge folder.

Defaults to transmission-HEX32_TIME.json

### /load

Load a saved conversation history snapshot.

User can specify a save index or file name to restore previous chats.


### /time

Display the current system time. 

Helps user verify system status.

### /help

If you are reading this file, it may be due to the use of this command.

If you still need help visit the project page.

## foundry prompt report

[model modelname promptTokens replyTokens totalTokens contextSize]

* promptTokens used in the context - drop files to reduce
* replyTokens used for completions - typically cost more
* totalTokens a running total of tokens used
* contextSize estimate in bytes of all files share
