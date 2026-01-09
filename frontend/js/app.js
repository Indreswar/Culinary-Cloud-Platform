/**
 * Culinary Cloud Platform - Client App
 *
 * Configure API_BASE_URL to your backend.
 * - Local Flask: http://localhost:5000
 * - Azure App Service: https://<your-app>.azurewebsites.net
 *
 * Tip: To change without editing code:
 *   localStorage.setItem('API_BASE_URL','https://YOUR_BACKEND_URL');
 */
const API_BASE_URL = localStorage.getItem('API_BASE_URL') || 'http://127.0.0.1:5000';

const API = {
  recipes: () => `${API_BASE_URL}/api/recipes`,
  recipe: (id) => `${API_BASE_URL}/api/recipes/${id}`,
};

function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}
function authHeaders(extra = {}) {
  const token = getAuthToken();
  return token ? { ...extra, 'Authorization': `Bearer ${token}` } : extra;
}

/**
 * Fetch all recipes
 */
async function loadRecipes() {
    const container = document.getElementById('recipe-container');
    const loadingText = document.getElementById('loading-text');

    if (API.recipes().includes('REPLACE_WITH')) {
        loadingText.innerHTML = `
            <strong>API Not Configured.</strong><br>
            Please update <code>js/app.js</code> with your Azure Logic App URLs.<br>
            <br>
            <em>Showing mock data for demonstration:</em>
        `;
        renderRecipes(getMockData()); // Fallback to mock data
        return;
    }

    try {
        const response = await fetch(API.recipes());
        if (!response.ok) throw new Error('Failed to fetch recipes');

        const recipes = await response.json();
        renderRecipes(recipes);
        loadingText.style.display = 'none';
    } catch (error) {
        console.error('Error:', error);
        loadingText.innerHTML = 'Error loading recipes. Please attempt refreshing or check console.';
    }
}

/**
 * Render list of recipes
 */
function renderRecipes(recipes) {
    const container = document.getElementById('recipe-container');
    const template = document.querySelector('.recipe-card.template');

    recipes.forEach(recipe => {
        const card = template.cloneNode(true);
        card.classList.remove('template');
        card.style.display = 'block';

        const img = card.querySelector('.recipe-image');
        // Handle if image is a full URL or a relative path (or base64)
        img.src = recipe.imageUrl || 'https://via.placeholder.com/400x300?text=No+Image';

        card.querySelector('.recipe-title').textContent = recipe.title;
        card.querySelector('.recipe-desc').textContent = recipe.description;
        card.querySelector('.btn-view').href = `view.html?id=${recipe.id}`;

        // Public edit/delete on card
        const editBtn = card.querySelector('.btn-edit-card');
        const delBtn = card.querySelector('.btn-delete-card');
        editBtn?.addEventListener('click', () => {
            window.location.href = `view.html?id=${recipe.id}&edit=1`;
        });
        delBtn?.addEventListener('click', async () => {
            if (!confirm('Delete this recipe?')) return;
            try {
                const resp = await fetch(API.recipe(recipe.id), { method: 'DELETE', headers: authHeaders() });
                if (!resp.ok) {
                    const t = await resp.text();
                    throw new Error(`Delete failed (${resp.status}): ${t}`);
                }
                // Remove card from UI
                card.remove();
            } catch (e) {
                console.error(e);
                alert('Delete failed.');
            }
        });

        container.appendChild(card);
    });
}

/**
 * Handle Recipe Upload
 */
async function handleUpload(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Uploading...';
    btn.disabled = true;

    try {
        const formData = new FormData(e.target);

        // 1. Handle Image Upload
        // In a real production app with large files, we would request a SAS token here
        // and upload directly to Blob Storage.
        // For this lab prototype, we will convert to Base64 to send in the JSON body 
        // OR we upload to a Logic App that handles the stream.
        // Let's use Base64 for simplicity in Logic App handling if the payload is small (<100MB).

        const file = formData.get('image');
        let imageUrl = '';

        if (file && file.size > 0) {
            imageUrl = await convertToBase64(file);
            // In a real scenario, you'd upload this to Blob Storage and get a URL back.
            // For now, we'll send the base64 string or a placeholder if it's too huge.
            // Ideally: await uploadToBlob(file);
        }

        const recipeData = {
            title: formData.get('title'),
            description: formData.get('description'),
            ingredients: formData.get('ingredients').split('\n').filter(i => i.trim()),
            imageUrl: imageUrl, // Sending base64 or URL
            createdAt: new Date().toISOString()
        };

        if (API.recipes().includes('REPLACE_WITH')) {
            alert('API URL not configured! (Check js/app.js)');
            console.log('Would send:', recipeData);
            // Simulate success
            setTimeout(() => {
                alert('Recipe "saved" (Mock Mode). Redirecting...');
                window.location.href = 'index.html';
            }, 1000);
            return;
        }

        const response = await fetch(API.recipes(), {
            method: 'POST',
            headers: authHeaders({'Content-Type': 'application/json'}),
            body: JSON.stringify(recipeData)
        });

        if (response.ok) {
            alert('Recipe published successfully!');
            window.location.href = 'index.html';
        } else {
            throw new Error('Upload failed');
        }

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to publish recipe. See console for details.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

/**
 * Load Single Recipe Details
 */
async function loadRecipeDetails(id) {
    const container = document.getElementById('recipe-detail');

    try {
        const response = await fetch(API.recipe(id));
        if (!response.ok) throw new Error('Failed to fetch recipe');
        const recipe = await response.json();
        renderDetail(recipe);
        // Auto-open edit panel if '?edit=1'
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('edit') === '1') {
                const panel = document.getElementById('edit-panel');
                if (panel) panel.style.display = 'block';
            }
        } catch(_) {}

    } catch (error) {
        console.error('Error:', error);
        const mockRecipe = getMockData().find(r => r.id === id) || getMockData()[0];
        renderDetail(mockRecipe);
    }
}

function renderDetail(recipe) {
    const container = document.getElementById('recipe-detail');
    container.innerHTML = `
    <div class="detail-header">
        <h1>${recipe.title}</h1>
        <p style="color:#777">Published on ${new Date(recipe.createdAt || Date.now()).toLocaleDateString()}</p>
    </div>
    <img src="${recipe.imageUrl || 'https://via.placeholder.com/800x400'}" class="detail-image" alt="${recipe.title}">

    <h3>Description</h3>
    <p>${recipe.description}</p>

    <h3>Ingredients</h3>
    <ul class="ingredients-list">
        ${(recipe.ingredients || []).map(i => `<li>${i}</li>`).join('')}
    </ul>

    
    <div class="recipe-actions" style="display:flex; gap:10px; margin:16px 0;">
        <button id="btn-edit" class="btn">Edit</button>
        <button id="btn-delete" class="btn btn-danger">Delete</button>
    </div>

    <div id="edit-panel" style="display:none; margin-top:12px;">
        <h3>Edit Recipe</h3>
        <label>Title</label>
        <input id="edit-title" type="text" value="${recipe.title}" />
        <label>Description</label>
        <textarea id="edit-description" rows="5">${recipe.description}</textarea>
        <label>Ingredients (comma separated)</label>
        <input id="edit-ingredients" type="text" value="${(recipe.ingredients || []).join(', ')}" />
        <div style="display:flex; gap:10px; margin-top:12px;">
            <button id="btn-save" class="btn">Save</button>
            <button id="btn-cancel" class="btn btn-secondary">Cancel</button>
        </div>
        <p style="color:#777; margin-top:8px;">Note: Image editing not included here (re-upload via Upload page).</p>
    </div>
    

    <a href="index.html" class="btn btn-secondary">Back to Home</a>
`;


// Attach handlers (public demo)

    const editBtn = document.getElementById('btn-edit');
    const deleteBtn = document.getElementById('btn-delete');
    const panel = document.getElementById('edit-panel');

    editBtn?.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btn-cancel')?.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    document.getElementById('btn-save')?.addEventListener('click', async () => {
        const updated = {
            title: document.getElementById('edit-title')?.value || '',
            description: document.getElementById('edit-description')?.value || '',
            ingredients: (document.getElementById('edit-ingredients')?.value || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
        };

        try {
            const res = await fetch(API.recipe(recipe.id), {
                method: 'PUT',
                headers: authHeaders({'Content-Type': 'application/json'}),
                body: JSON.stringify(updated)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Update failed');
                return;
            }
            renderDetail(data);
        } catch (e) {
            console.error(e);
            alert('Update failed');
        }
    });

    deleteBtn?.addEventListener('click', async () => {
        if (!confirm('Delete this recipe?')) return;
        try {
            const res = await fetch(API.recipe(recipe.id), {
                method: 'DELETE',
                headers: authHeaders()
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Delete failed');
                return;
            }
            alert('Deleted');
            window.location.href = 'index.html';
        } catch (e) {
            console.error(e);
            alert('Delete failed');
        }
    });
}

// Utility: Convert File to Base64
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Mock Data for Demo
function getMockData() {
    return [
        {
            id: '1',
            title: 'Classic Spaghetti Carbonara',
            description: 'A traditional Roman pasta dish with egg, hard cheese, cured pork, and black pepper.',
            imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80',
            ingredients: ['Spaghetti', 'Eggs', 'Pecorino Romano', 'Guanciale', 'Black Pepper'],
            createdAt: '2025-01-08T12:00:00Z'
        },
        {
            id: '2',
            title: 'Avocado Toast',
            description: 'Simple yet delicious breakfast staple. Creamy avocado on crispy sourdough.',
            imageUrl: 'https://images.unsplash.com/photo-1588137372308-15f75323ca8d?auto=format&fit=crop&w=800&q=80',
            ingredients: ['Sourdough Bread', 'Avocado', 'Salt', 'Chili Flakes', 'Lemon Juice'],
            createdAt: '2025-01-07T09:30:00Z'
        }
    ];
}

// ---------- AUTO START ----------
document.addEventListener("DOMContentLoaded", () => {
  // Home page recipe list
  if (document.getElementById("recipe-container")) {
    loadRecipes();
  }

  // Upload page form submit
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", handleUpload);
  }

  // View page recipe details
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id && document.getElementById("recipe-detail")) {
    loadRecipeDetails(id);
  }
});

