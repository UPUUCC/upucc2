import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, query, orderBy, where, limit } from "firebase/firestore";
import Swal from 'sweetalert2';

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('loginForm');
    const loginAlert = document.getElementById('loginAlert');
    const btnLogin = document.getElementById('btnLogin');
    const formTitle = document.getElementById('formTitle');
    const backFromForm = document.getElementById('backFromForm');
    
    const TURNSTILE_SITEKEY = '0x4AAAAAAFg9Ftchkxaj4jRc';
    let turnstileWidgetId = null;

    function renderOrResetTurnstile() {
        const container = document.getElementById('cfTurnstile');
        if (!container) return;

        if (typeof window.turnstile === 'undefined') {
            setTimeout(renderOrResetTurnstile, 150);
            return;
        }

        if (turnstileWidgetId === null) {
            try {
                container.innerHTML = '';
                turnstileWidgetId = window.turnstile.render('#cfTurnstile', {
                    sitekey: TURNSTILE_SITEKEY,
                    theme: 'light',
                    size: 'normal'
                });
            } catch (err) {
                console.warn('Gagal render Cloudflare Turnstile:', err);
            }
        } else {
            try {
                window.turnstile.reset(turnstileWidgetId);
            } catch (err) {
                console.warn('Gagal reset Turnstile, mencoba re-render:', err);
                try {
                    container.innerHTML = '';
                    turnstileWidgetId = window.turnstile.render('#cfTurnstile', {
                        sitekey: TURNSTILE_SITEKEY,
                        theme: 'light',
                        size: 'normal'
                    });
                } catch (e) {}
            }
        }
    }

    // Expose callback for Turnstile script onload
    window.onloadTurnstileCallback = function() {
        const stepForm = document.getElementById('stepForm');
        if (stepForm && stepForm.classList.contains('active')) {
            renderOrResetTurnstile();
        }
    };

    // UI Navigation Logic
    function showStep(targetId) {
        document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(targetId);
        if (target) target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Save current step so it persists if user clicks back or refreshes (optional)
        sessionStorage.setItem('upucc_login_step', targetId);

        if (targetId === 'stepForm') {
            setTimeout(renderOrResetTurnstile, 60);
        }
    }

    // Attach click events to cards and back buttons
    document.body.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-action]');
        if (!trigger) return;

        const action = trigger.getAttribute('data-action');
        
        if (action === 'step') {
            const targetId = trigger.getAttribute('data-target');
            showStep(targetId);
        } else if (action === 'form') {
            const title = trigger.getAttribute('data-title');
            const icon = trigger.getAttribute('data-icon');
            const backTarget = trigger.getAttribute('data-back') || 'loginStep0';
            
            formTitle.innerHTML = `<i class="bi ${icon}"></i> ${title}`;
            backFromForm.setAttribute('data-target', backTarget);
            showStep('stepForm');
        }
    });

    // Check if ?daftar=1 is in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('daftar')) {
        showStep('stepDaftar');
    } else {
        const lastStep = sessionStorage.getItem('upucc_login_step');
        if (lastStep && document.getElementById(lastStep)) {
            showStep(lastStep);
        }
    }

    // Fetch Divisions for Kadiv & Anggota steps
    try {
        const divSnap = await getDocs(query(collection(db, "divisions"), orderBy("id", "asc")));
        let kadivHTML = '';
        let anggotaHTML = '';

        divSnap.forEach(docSnap => {
            const d = docSnap.data();
            kadivHTML += `
            <div class="col-6 col-md-4">
              <div class="login-menu-card" data-action="form" data-title="Login Kadiv/Wakadiv ${d.nama}" data-icon="bi-diagram-3" data-back="stepDivisiKadiv">
                <i class="bi bi-diagram-3"></i>
                <div class="lbl">Kadiv / Wakadiv</div>
                <div class="sub">${d.nama}</div>
              </div>
            </div>`;
            
            anggotaHTML += `
            <div class="col-6 col-md-4">
              <div class="login-menu-card" data-action="form" data-title="Login Anggota ${d.nama}" data-icon="bi-person" data-back="stepDivisiAnggota">
                <i class="bi bi-person"></i>
                <div class="lbl">Anggota</div>
                <div class="sub">Divisi ${d.nama}</div>
              </div>
            </div>`;
        });

        document.getElementById('listDivisiKadiv').innerHTML = kadivHTML;
        document.getElementById('listDivisiAnggota').innerHTML = anggotaHTML;

        // Hide loading, show container
        document.getElementById('loginLoading').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'block';

    } catch (err) {
        console.error("Gagal memuat divisi: ", err);
        document.getElementById('loginLoading').innerHTML = '<div class="alert alert-danger">Gagal memuat data menu. Silakan refresh halaman.</div>';
    }


    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // Verifikasi Cloudflare Turnstile
            const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]')?.value;
            if (!turnstileResponse) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Verifikasi Keamanan',
                    text: 'Harap selesaikan verifikasi centang Cloudflare terlebih dahulu.',
                    confirmButtonColor: '#0a369d'
                });
                return;
            }
            
            loginAlert.classList.add('d-none');
            btnLogin.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Memproses...';
            btnLogin.disabled = true;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                btnLogin.innerHTML = '<i class="bi bi-check-circle"></i> Berhasil Login';
                btnLogin.classList.replace('btn-primary', 'btn-success');
                
                // Default: arahkan ke dashboard admin
                let targetUrl = "/dashboard/index.html";
                try {
                    const q = query(collection(db, "members"), where("email", "==", email.toLowerCase().trim()), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const role = (snap.docs[0].data().role || '').toLowerCase();
                        if (role === 'anggota') {
                            targetUrl = "/member/profil.html"; // Anggota biasa
                        } else if (role === 'kadiv' || role === 'wakadiv') {
                            targetUrl = "/dashboard/kadiv_panel.html"; // Kadiv langsung ke panel divisi
                        } else if (role === 'sekretaris' || role === 'wakil_sekretaris') {
                            targetUrl = "/dashboard/pendaftaran.html"; // Sekretaris langsung ke pendaftaran
                        } else if (role === 'bendahara' || role === 'wakil_bendahara') {
                            targetUrl = "/dashboard/keuangan.html"; // Bendahara langsung ke kas
                        }
                        // role lain (admin, ketum, dll) → tetap dashboard utama
                    }
                    // Jika tidak ditemukan di members → tetap dashboard (akun admin langsung)
                } catch(e) {
                    console.error("Gagal mengecek role:", e);
                }

                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 1000);
            } catch (error) {
                const errorCode = error.code;
                let errorMessage = "Terjadi kesalahan saat login. Silakan coba lagi.";
                
                if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
                    errorMessage = "Email atau password yang Anda masukkan salah.";
                } else if (errorCode === 'auth/too-many-requests') {
                    errorMessage = "Terlalu banyak percobaan login. Silakan coba lagi nanti.";
                } else if (errorCode === 'auth/invalid-email') {
                    errorMessage = "Format email tidak valid.";
                }
                
                loginAlert.textContent = errorMessage;
                loginAlert.classList.remove('d-none');
                
                if (window.turnstile) {
                    if (turnstileWidgetId !== null) {
                        try { window.turnstile.reset(turnstileWidgetId); } catch(err) {}
                    } else {
                        renderOrResetTurnstile();
                    }
                }

                btnLogin.innerHTML = 'Login';
                btnLogin.disabled = false;
            }
        });
    }
});

