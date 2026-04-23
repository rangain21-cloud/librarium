/**
 * ═══════════════════════════════════════════════════════════════════
 * GOOGLE DRIVE INTEGRATION FOR LIBRARIUM
 * ═══════════════════════════════════════════════════════════════════
 * 
 * À inclure dans votre HTML avec :
 * <script src="google_drive_functions.js"></script>
 * 
 * Prérequis :
 * - Papa (déjà intégré dans Biblio)
 * - appState (déjà défini dans Biblio)
 * - Fonctions : updateFilters, renderBooksTable, updateButtonStates, etc.
 */

// Configuration Google Drive pour Librarium
const GDRIVE_CONFIG = {
    CLIENT_ID: 'VOTRE_CLIENT_ID.apps.googleusercontent.com',  // À REMPLACER
    API_KEY: 'VOTRE_API_KEY',  // À REMPLACER
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    SCOPES: 'https://www.googleapis.com/auth/drive'
};

let gapiInited = false;
let gisInited = false;
let tokenClient;
let accessToken = null;
let driveConnected = false;

// ═══════════════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════════════

function waitForGAPI() {
    return new Promise((resolve) => {
        if (window.gapi) {
            console.log('✓ GAPI déjà disponible');
            resolve();
        } else {
            console.log('⏳ En attente du chargement de GAPI...');
            const checkInterval = setInterval(() => {
                if (window.gapi) {
                    console.log('✓ GAPI maintenant disponible');
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.gapi) {
                    console.error('❌ Timeout: GAPI n\'a pas pu être chargé');
                }
                resolve();
            }, 10000);
        }
    });
}

function waitForGIS() {
    return new Promise((resolve) => {
        if (window.google?.accounts) {
            console.log('✓ GIS déjà disponible');
            resolve();
        } else {
            console.log('⏳ En attente du chargement de GIS...');
            const checkInterval = setInterval(() => {
                if (window.google?.accounts) {
                    console.log('✓ GIS maintenant disponible');
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.google?.accounts) {
                    console.error('❌ Timeout: GIS n\'a pas pu être chargé');
                }
                resolve();
            }, 10000);
        }
    });
}

// Initialiser au chargement
window.addEventListener('load', async () => {
    if (navigator.onLine) {
        console.log('🚀 Initialisation Google Drive API...');
        
        try {
            await waitForGAPI();
            
            await new Promise((resolve, reject) => {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: GDRIVE_CONFIG.API_KEY,
                            discoveryDocs: GDRIVE_CONFIG.DISCOVERY_DOCS,
                        });
                        gapiInited = true;
                        console.log('✓ GAPI initialisé');
                        resolve();
                    } catch (error) {
                        console.error('❌ Erreur init GAPI:', error);
                        reject(error);
                    }
                });
            });
            
            await waitForGIS();
            
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GDRIVE_CONFIG.CLIENT_ID,
                scope: GDRIVE_CONFIG.SCOPES,
                callback: (response) => {
                    if (response.error) {
                        console.error('✗ OAuth error:', response);
                        return;
                    }
                    accessToken = response.access_token;
                    driveConnected = true;
                    updateDriveButtons(true);
                    console.log('✓ Connecté à Drive');
                }
            });
            gisInited = true;
            console.log('✓ GIS initialisé');
            
        } catch (error) {
            console.error('❌ Erreur initialisation Drive:', error);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════
// FONCTIONS PUBLIQUES
// ═══════════════════════════════════════════════════════════════════

function connectToDrive() {
    if (!gapiInited || !gisInited) {
        alert('API Google en cours de chargement, veuillez patienter...');
        return;
    }
    
    if (driveConnected) {
        alert('Déjà connecté à Drive');
        return;
    }
    
    tokenClient.requestAccessToken({prompt: 'consent'});
}

function updateDriveButtons(connected) {
    const connectBtn = document.getElementById('driveConnectBtn');
    const loadBtn = document.getElementById('driveLoadBtn');
    const saveBtn = document.getElementById('driveSaveBtn');
    
    if (connectBtn) {
        if (connected) {
            connectBtn.textContent = '✓ Connecté';
            connectBtn.style.background = '#34a853';
        } else {
            connectBtn.textContent = '☁️ Connecter Drive';
            connectBtn.style.background = '#4285f4';
        }
    }
    
    if (loadBtn) loadBtn.disabled = !connected;
    if (saveBtn) saveBtn.disabled = !connected;
}

async function saveToGoogleDrive(fileName, content) {
    if (!driveConnected) {
        throw new Error('Non connecté à Drive');
    }
    
    try {
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='${fileName}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        const files = searchResponse.result.files;
        const metadata = {
            name: fileName,
            mimeType: 'text/csv'
        };
        
        const blob = new Blob([content], { type: 'text/csv' });
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob);
        
        let response;
        if (files && files.length > 0) {
            response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: formData
            });
        } else {
            response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: formData
            });
        }
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        console.log(`✓ ${fileName} sauvegardé sur Drive`);
        return await response.json();
        
    } catch (error) {
        console.error(`❌ Erreur sauvegarde ${fileName}:`, error);
        throw error;
    }
}

async function loadFromGoogleDrive(fileName) {
    if (!driveConnected) {
        throw new Error('Non connecté à Drive');
    }
    
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive',
            orderBy: 'modifiedTime desc'
        });
        
        const files = response.result.files;
        if (!files || files.length === 0) {
            console.log(`⚠️ ${fileName} non trouvé sur Drive`);
            return null;
        }
        
        const fileId = files[0].id;
        const contentResponse = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        console.log(`✓ ${fileName} chargé depuis Drive`);
        return contentResponse.body;
        
    } catch (error) {
        console.error(`❌ Erreur chargement ${fileName}:`, error);
        throw error;
    }
}

async function loadAllFromDrive() {
    if (!driveConnected) {
        alert('Veuillez d\'abord vous connecter à Google Drive');
        return;
    }
    
    try {
        console.log('⬇️ Chargement des fichiers depuis Drive...');
        
        // Charger Ouvrages.csv
        const ouvragesContent = await loadFromGoogleDrive('Ouvrages.csv');
        if (ouvragesContent) {
            Papa.parse(ouvragesContent, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    appState.booksData = results.data;
                    appState.booksFilename = 'Ouvrages.csv';
                    if (typeof updateFilters === 'function') updateFilters();
                    if (typeof renderBooksTable === 'function') renderBooksTable();
                    if (typeof populateBookForm === 'function') populateBookForm();
                    if (typeof updateButtonStates === 'function') updateButtonStates();
                    console.log('✓ Ouvrages chargés:', results.data.length, 'lignes');
                }
            });
        }
        
        // Charger Auteurs.csv
        const auteursContent = await loadFromGoogleDrive('Auteurs.csv');
        if (auteursContent) {
            Papa.parse(auteursContent, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    appState.authorsData = results.data;
                    appState.authorsFilename = 'Auteurs.csv';
                    if (typeof updateButtonStates === 'function') updateButtonStates();
                    console.log('✓ Auteurs chargés:', results.data.length, 'lignes');
                }
            });
        }
        
        // Charger Lecteurs.csv
        const lecteursContent = await loadFromGoogleDrive('Lecteurs.csv');
        if (lecteursContent) {
            Papa.parse(lecteursContent, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    appState.readersData = results.data;
                    appState.readersFilename = 'Lecteurs.csv';
                    if (typeof updateReaderDatalists === 'function') updateReaderDatalists();
                    if (typeof updateButtonStates === 'function') updateButtonStates();
                    console.log('✓ Lecteurs chargés:', results.data.length, 'lignes');
                }
            });
        }
        
        if (ouvragesContent || auteursContent || lecteursContent) {
            console.log('✓ Données chargées depuis Drive avec succès');
            alert('✓ Fichiers chargés depuis Drive avec succès !');
        } else {
            alert('⚠️ Aucun fichier trouvé sur Drive');
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement Drive:', error);
        alert('❌ Erreur lors du chargement: ' + error.message);
    }
}

async function saveAllToDrive() {
    if (!driveConnected) {
        alert('Veuillez d\'abord vous connecter à Google Drive');
        return;
    }
    
    if (!appState.booksData || appState.booksData.length === 0) {
        alert('Aucune donnée à sauvegarder. Chargez d\'abord des fichiers.');
        return;
    }
    
    try {
        console.log('⬆️ Sauvegarde sur Drive...');
        
        // Sauvegarder Ouvrages.csv
        const ouvragesCSV = Papa.unparse(appState.booksData, { delimiter: '\t' });
        await saveToGoogleDrive('Ouvrages.csv', ouvragesCSV);
        
        // Sauvegarder Auteurs.csv
        if (appState.authorsData && appState.authorsData.length > 0) {
            const auteursCSV = Papa.unparse(appState.authorsData, { delimiter: '\t' });
            await saveToGoogleDrive('Auteurs.csv', auteursCSV);
        }
        
        // Sauvegarder Lecteurs.csv
        if (appState.readersData && appState.readersData.length > 0) {
            const lecteursCSV = Papa.unparse(appState.readersData, { delimiter: '\t' });
            await saveToGoogleDrive('Lecteurs.csv', lecteursCSV);
        }
        
        console.log('✓ Tous les fichiers sauvegardés sur Drive');
        alert('✓ Fichiers sauvegardés sur Drive avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde Drive:', error);
        alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    }
}

function testDrive() {
    const infos = {
        '1. CLIENT_ID configuré': !GDRIVE_CONFIG.CLIENT_ID.includes('VOTRE'),
        '2. API_KEY configurée': !GDRIVE_CONFIG.API_KEY.includes('VOTRE'),
        '3. En ligne': navigator.onLine,
        '4. GAPI disponible': typeof gapi !== 'undefined',
        '5. GAPI initialisé': gapiInited,
        '6. GIS disponible': typeof google !== 'undefined' && google.accounts !== undefined,
        '7. GIS initialisé': gisInited,
        '8. Connecté à Drive': driveConnected
    };
    
    let message = 'DIAGNOSTIC GOOGLE DRIVE:\n\n';
    for (let key in infos) {
        message += (infos[key] ? '✅' : '❌') + ' ' + key + '\n';
    }
    
    alert(message);
    console.table(infos);
}
