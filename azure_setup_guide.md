# Azure Setup Guide for Culinary Cloud Platform

This guide details the steps to provision and configure the necessary Azure resources.

## 1. Resource Group
1. Create a new Resource Group: `rg-culinary-cloud`.
2. Region: Select a region close to you (e.g., `UK South`).

## 2. Azure Cosmos DB (NoSQL)
1. Create an **Azure Cosmos DB for NoSQL** account: `cosmos-culinary-cloud`.
2. Capacity mode: **Serverless** (efficient for potential low usage/intermittent traffic) or **Provisioned** (if high regular traffic is expected).
3. Create a Database: `CulinaryDB`.
4. Create a Container: `Recipes`.
   - Partition Key: `/category` (or `/id` if mainly retrieving by ID). Let's use `/category` for filtering.

## 3. Azure Storage Account
1. Create a Storage Account: `stculinarycloud`.
2. Performance: Standard.
3. Redundancy: LRS (Locally-redundant storage) is sufficient for dev; GRS for production.
4. **Blob Service**:
   - Create a container named `uploads`.
   - Set Public Access Level: **Blob** (allow anonymous read access for only blobs, so images can be displayed in frontend).
5. **CORS (Cross-Origin Resource Sharing)**:
   - Go to "settings" -> "Resource sharing (CORS)".
   - Blob service -> Add:
     - Allowed origins: `*` (or your static web app URL).
     - Allowed methods: `GET`, `POST`, `OPTIONS`, `PUT`.
     - Allowed headers: `*`.
     - Exposed headers: `*`.
     - Max age: `86400`.

## 4. Azure Logic Apps (REST API)
We will create a **Standard** or **Consumption** Logic App. Consumption is fine for this scale and event-driven nature.
Create a Logic App Resource: `logic-culinary-api`.

### API Design & Workflows
You will create separate workflows (or one large one with a switch, but separate is cleaner) for each endpoint.

#### A. Create Recipe (POST /api/recipes)
1. **Trigger**: `When a HTTP request is received`.
   - Method: `POST`.
   - JSON Schema:
     ```json
     {
       "type": "object",
       "properties": {
         "title": { "type": "string" },
         "description": { "type": "string" },
         "imageUrl": { "type": "string" },
         "ingredients": { "type": "array" }
       }
     }
     ```
2. **Action**: `Cosmos DB - Create or update document (V3)`.
   - Database ID: `CulinaryDB`.
   - Collection ID: `Recipes`.
   - Document: `@triggerBody()` (map fields tailored to your schema, ensuring an `id` is generated).
3. **Response**: Status `201 Created`, Body: `{"id": "@{body('Create_or_update_document')?['id']}", "message": "Recipe created"}`.

#### B. Get Recipes (GET /api/recipes)
1. **Trigger**: `When a HTTP request is received`.
    - Method: `GET`.
2. **Action**: `Cosmos DB - Query documents (V3)`.
    - Query: `SELECT * FROM c` (Add `WHERE` clauses if query params are passed).
3. **Response**: Status `200 OK`, Body: `@body('Query_documents')`.

#### C. Get Media Upload URL (POST /api/media/upload-url)
To allow secure direct uploads from browser to Blob Storage (SAS Token pattern).
1. **Trigger**: `When a HTTP request is received` (POST).
    - Body: `{"filename": "..."}`.
2. **Action**: `Create SAS URI by path (V2)` (Azure Blob Storage).
    - Path: `/uploads/@{triggerBody()?['filename']}`.
    - Permissions: `Write`.
    - Expiry: `Now + 15 minutes`.
3. **Response**: Status `200 OK`, Body: `{"uploadUrl": "@{body('Create_SAS_URI_by_path')?['WebUrl']}"}`.

*Note: Alternatively, for simplicity in the lab, you might just accept the file base64 in the Logic App and use "Create Blob", but the SAS token approach is "Cloud Native" best practice for large files.*

## 5. Azure Application Insights
1. Create a workspace-based Application Insights resource: `appins-culinary`.
2. Link it to the Logic App and any other compute resources.
3. Enable "Diagnostic settings" on Logic App to send logs to the Log Analytics workspace associated with App Insights.

## 6. Azure Static Web Apps
1. Create a Static Web App: `swa-culinary-frontend`.
2. Source: GitHub.
3. Build Details: Select `Custom`.
   - App location: `/`.
   - Output location: `.`.
4. This will give you a public URL. Update the CORS settings in your Logic App and Storage Account to allow this URL if you restricted `*`.
