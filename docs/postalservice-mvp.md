I'm currently using postman to test APIs, they have just changed their licencing agreements and I'm now unable to use collections that I created.
Bruno is a half-baked alternative, and I do not like it.
I want to create an application that runs on Mac OS X, Linux and Windows that is similar to postman
MVP:
 - Must support git repositories to allow for sharing of files 
    - store files locally, within a git commited repo
    - keep environment values in a separate file that is automatically added to the .gitignore to ensure that secrets are not persisted / saved to a git repo.
 - Must be able to import Postman V2 JSON files (collections and Environment collections)
 - Must be scriptable and compatible with Postmans Javascript Scripting 
 - Must allow mustached braces for environment variables like postman to allow for distinction between test / production
 - Must support customisable Headers 
 - Must support HTML x-www-form-urlencoded, form-data and raw bodies (JSON format at a minimum)
 - Must support all REST style, GET,POST,PUT,PATCH, DELETE, HEAD, OPTIONS
 - Must support authorization using Basic Auth, JWT Auth, Bearer Token on All the above requests

Ideally this should use a similar engine, perhaps the chromium engine to allow for Javascript and debug outputs
If there is already an engine that can do this, re-use, try not to re-write everything if there is something similar / compatible already available.
