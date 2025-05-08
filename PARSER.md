## Parser logic explanation

1. Find registration opened message ✅
2. Find time of registration closing ✅
3. Remove information "fromMe": false ✅
4. Remove messages with "content": "" ✅
5. Select only messages between registration opened and closed
6. Detect system messages
7. Remove system messages
8. Add sender name to messages
9. Find batch keywords
10. Find team separator keywords
11. Find player names
12. Find messages with teams

