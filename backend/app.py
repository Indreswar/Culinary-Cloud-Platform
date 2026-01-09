

def find_recipe_by_id(recipe_id: str):
    """Find a recipe by id across partitions and return (item, pk) or (None, None)."""
    query = "SELECT * FROM c WHERE c.id = @id"
    params = [ { "name": "@id", "value": recipe_id } ]
    items = list(recipes_container.query_items(
        query=query,
        parameters=params,
        enable_cross_partition_query=True
    ))
    if not items:
        return None, None
    item = items[0]
    pk = item.get("pk")
    return item, pk

import os
import base64
import uuid
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from azure.storage.blob import BlobServiceClient, ContentSettings
from dotenv import load_dotenv


load_dotenv()

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DB = os.getenv("COSMOS_DB", "CulinaryDB")
COSMOS_RECIPES_CONTAINER = os.getenv("COSMOS_RECIPES_CONTAINER", "Recipes")
COSMOS_USERS_CONTAINER = os.getenv("COSMOS_USERS_CONTAINER", "Users")

AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
BLOB_CONTAINER = os.getenv("BLOB_CONTAINER", "uploads")

if not COSMOS_ENDPOINT or not COSMOS_KEY:
    raise RuntimeError("Missing COSMOS_ENDPOINT or COSMOS_KEY environment variables.")
if not AZURE_STORAGE_CONNECTION_STRING:
    raise RuntimeError("Missing AZURE_STORAGE_CONNECTION_STRING environment variable.")




app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# --- CORS headers (supports PUT/DELETE from browsers incl. file:// demos) ---
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    return response

@app.route('/api/<path:_path>', methods=['OPTIONS'])
def cors_preflight(_path):
    return ('', 204)

@app.get("/")
def home():
    return {"status": "ok", "message": "Culinary API running"}

# ---- Cosmos setup ----
cosmos_client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
db = cosmos_client.create_database_if_not_exists(id=COSMOS_DB)

# Recipes container: partition key /pk
recipes_container = db.create_container_if_not_exists(
    id=COSMOS_RECIPES_CONTAINER,
    partition_key=PartitionKey(path="/pk")
)

# Users container: partition key /pk
users_container = db.create_container_if_not_exists(
    id=COSMOS_USERS_CONTAINER,
    partition_key=PartitionKey(path="/pk")
)

# ---- Blob setup ----
blob_service = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
container_client = blob_service.get_container_client(BLOB_CONTAINER)
try:
    container_client.create_container()
except Exception:
    pass  # already exists


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")




def upload_data_url_image(data_url: str) -> str:
    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("imageUrl must be a data URL string")
    header, b64 = data_url.split(",", 1)
    content_type = "image/png"
    if header.startswith("data:") and ";base64" in header:
        content_type = header[5:header.index(";base64")]
    raw = base64.b64decode(b64)
    ext = "png"
    if "jpeg" in content_type or "jpg" in content_type:
        ext = "jpg"
    blob_name = f"{uuid.uuid4().hex}.{ext}"
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(
        raw,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type)
    )
    return blob_client.url


@app.get("/api/health")
def health():
    return {"status": "ok", "time": now_iso()}


# ---------------- AUTH ----------------


    query = "SELECT * FROM c WHERE c.pk='users' AND c.email=@email"
    items = list(users_container.query_items(
        query=query,
        parameters=[{"name": "@email", "value": email}],
        enable_cross_partition_query=True
    ))
    if not items:
        return jsonify({"error": "Invalid credentials"}), 401
    user = items[0]
    if not bcrypt.verify(password, user.get("passwordHash", "")):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["id"], user["email"])
    return jsonify({"message": "Logged in", "token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name","")}})


# --------------- RECIPES (public read, protected write) ---------------

@app.get("/api/recipes")
def list_recipes():
    query = "SELECT * FROM c WHERE c.pk='recipes' ORDER BY c.createdAt DESC"
    items = list(recipes_container.query_items(query=query, enable_cross_partition_query=True))
    return jsonify(items)


@app.get("/api/recipes/<recipe_id>")
def get_recipe(recipe_id):
    try:
        item = None
        pk = "recipes"
        try:
            item = recipes_container.read_item(item=recipe_id, partition_key=pk)
        except exceptions.CosmosResourceNotFoundError:
            item, pk = find_recipe_by_id(recipe_id)
            if not item or not pk:
                raise
            item = recipes_container.read_item(item=recipe_id, partition_key=pk)
        return jsonify(item)
    except exceptions.CosmosResourceNotFoundError:
        return jsonify({"error": "Not found"}), 404


@app.post("/api/recipes")
def create_recipe():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    ingredients = data.get("ingredients") or []
    image_url = data.get("imageUrl")

    if not title or not description:
        return jsonify({"error": "title and description are required"}), 400

    blob_url = ""
    if isinstance(image_url, str) and image_url.startswith("data:image/"):
        blob_url = upload_data_url_image(image_url)
    elif isinstance(image_url, str) and image_url.startswith("http"):
        blob_url = image_url

    recipe_id = uuid.uuid4().hex
    doc = {
        "id": recipe_id,
        "pk": "recipes",
        "title": title,
        "description": description,
        "ingredients": ingredients,
        "imageUrl": blob_url,
        "createdAt": data.get("createdAt") or now_iso(),
        "updatedAt": now_iso(),
        "createdBy": "public",
    }
    recipes_container.create_item(body=doc)
    return jsonify(doc), 201


@app.put("/api/recipes/<recipe_id>")
def update_recipe(recipe_id):
    data = request.json or {}

    try:
        query = "SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": recipe_id}]
        items = list(recipes_container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True
        ))

        if not items:
            return jsonify({"error": "Not found"}), 404

        item = items[0]
        pk = item.get("pk")

        # update fields (keep existing if not provided)
        item["title"] = data.get("title", item.get("title"))
        item["description"] = data.get("description", item.get("description"))
        item["ingredients"] = data.get("ingredients", item.get("ingredients"))

        # Try replace with pk, else fall back
        tried = []
        if pk is not None:
            try:
                recipes_container.replace_item(item=item["id"], body=item, partition_key=pk)
                return jsonify(item), 200
            except exceptions.CosmosResourceNotFoundError:
                tried.append(pk)

        for fallback_pk in ["recipes", ""]:
            if fallback_pk in tried:
                continue
            try:
                recipes_container.replace_item(item=item["id"], body=item, partition_key=fallback_pk)
                return jsonify(item), 200
            except exceptions.CosmosResourceNotFoundError:
                continue

        return jsonify({"error": "Not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.delete("/api/recipes/<recipe_id>")
def delete_recipe(recipe_id):
    try:
        # 1) Find item first (cross-partition query)
        query = "SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": recipe_id}]
        items = list(recipes_container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True
        ))

        if not items:
            return jsonify({"error": "Not found"}), 404

        item = items[0]
        pk = item.get("pk")

        # 2) Try delete using pk if present
        tried = []
        if pk is not None:
            try:
                recipes_container.delete_item(item=recipe_id, partition_key=pk)
                return jsonify({"message": "Deleted"}), 200
            except exceptions.CosmosResourceNotFoundError:
                tried.append(pk)

        # 3) Fallbacks (covers older data patterns)
        for fallback_pk in ["recipes", ""]:
            if fallback_pk in tried:
                continue
            try:
                recipes_container.delete_item(item=recipe_id, partition_key=fallback_pk)
                return jsonify({"message": "Deleted"}), 200
            except exceptions.CosmosResourceNotFoundError:
                continue

        return jsonify({"error": "Not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)