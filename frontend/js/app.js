/**
 * Culinary Cloud Platform - Client App
 * 
 * IMPORTANT: Replace the API_BASE_URL with your actual Logic App HTTP Trigger URLs.
 * Since Logic Apps have unique URLs for each trigger, we will map them here.
 */

// CONFIGURATION - REPLACE THESE URLS AFTER DEPLOYING LOGIC APPS
const API_CONFIG = {
    // URL from the 'Get Recipes' Logic App
    GET_RECIPES_URL: 'REPLACE_WITH_YOUR_GET_RECIPES_LOGIC_APP_URL',

    // URL from the 'Create Recipe' Logic App
    CREATE_RECIPE_URL: 'REPLACE_WITH_YOUR_CREATE_RECIPE_LOGIC_APP_URL',

    // URL from the 'Get Upload URL' Logic App (or direct SAS generation endpoint)
    // If you don't implement the SAS token flow for the lab, you might send base64 to the Create Recipe endpoint.
    // For this implementation, we will assume a direct upload or base64 approach for simplicity if SAS isn't ready.
    GET_UPLOAD_URL_ENDPOINT: 'REPLACE_WITH_YOUR_UPLOAD_TOKEN_LOGIC_APP_URL'
};

/**
 * Fetch all recipes
 */
async function loadRecipes() {
    const container = document.getElementById('recipe-container');
    const loadingText = document.getElementById('loading-text');

    if (API_CONFIG.GET_RECIPES_URL.includes('REPLACE_WITH')) {
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
        const response = await fetch(API_CONFIG.GET_RECIPES_URL);
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
        card.querySelector('a').href = `view.html?id=${recipe.id}`;

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

        if (API_CONFIG.CREATE_RECIPE_URL.includes('REPLACE_WITH')) {
            alert('API URL not configured! (Check js/app.js)');
            console.log('Would send:', recipeData);
            // Simulate success
            setTimeout(() => {
                alert('Recipe "saved" (Mock Mode). Redirecting...');
                window.location.href = 'index.html';
            }, 1000);
            return;
        }

        const response = await fetch(API_CONFIG.CREATE_RECIPE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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

    if (API_CONFIG.GET_RECIPES_URL.includes('REPLACE_WITH')) {
        // Mock data fallback
        const mockRecipe = getMockData().find(r => r.id === id) || getMockData()[0];
        renderDetail(mockRecipe);
        return;
    }

    try {
        // Assuming the GET URL supports query params or we fetch all and filter (inefficient but simple)
        // Or we have a specific endpoint: API_CONFIG.GET_RECIPE_BY_ID_URL
        // Let's assume we filter the list for now if strict REST isn't set up
        const response = await fetch(API_CONFIG.GET_RECIPES_URL);
        const recipes = await response.json();
        const recipe = recipes.find(r => r.id === id);

        if (recipe) {
            renderDetail(recipe);
        } else {
            container.innerHTML = '<p>Recipe not found.</p>';
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p>Error loading recipe.</p>';
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
        
        <a href="index.html" class="btn btn-secondary">Back to Home</a>
    `;
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
