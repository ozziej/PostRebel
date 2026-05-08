Collection runner.

Currently when clicking on "+" on a collection it automatically adds a new request.
This should show a dropdown of "Runner Script" or "Request"
This must open a window that allows you to then add a request from your current collection OR a new request.
The window must be a flow diagram that must draw blocks with connectors. 
The connectors must either be in or out.
A "in" connector must accept input from another script. e.g. a {{variable}} or a response from a previous request.
An "out" connector must allow you to send the output of a request or script to another script or request.
The flow diagram must allow you to connect the blocks together to create a sequence of requests and scripts that can be executed in order.
The flow diagram must also allow you to save and load your runner scripts for future use.
The runner script must be able to execute the requests and scripts in the order defined by the flow diagram, passing data between them as needed.
The runner script must also allow you to set variables and parameters for each request and script, and use those variables in the flow diagram.
The runner script must also allow you to view the results of each request and script execution, and provide options for debugging and error handling.
The runner script must also allow you to export the flow diagram as a JSON or YAML file for sharing and collaboration with other users.
The runner script must also allow you to import flow diagrams from JSON or YAML files, and convert them into executable runner scripts.

Future:
- Add support for conditional logic in the flow diagram, allowing users to create branches and loops based on the results of previous requests or scripts.
- Add support for parallel execution of requests and scripts in the flow diagram, allowing users to run multiple requests or scripts simultaneously and manage their dependencies.
- Add support for version control of runner scripts, allowing users to track changes and revert to previous versions if needed.
- Add support for collaboration features, allowing multiple users to work on the same runner script and see each other's changes in real-time.
- Add support for integration with external tools and services, such as CI/CD pipelines, monitoring tools, and notification services, to enhance the functionality and automation capabilities of the runner script.

