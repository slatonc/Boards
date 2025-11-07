// Smooth scrolling for menu links
document.querySelectorAll('.menu a, .modal-cta').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        document.querySelector(targetId).scrollIntoView({
            behavior: 'smooth'
        });
        if (this.classList.contains('modal-cta')) {
            document.getElementById('pdfModal').style.display = 'none';
        }
    });
});

// Fixed CTA button behavior
const headerCta = document.querySelector('.header-cta');
const hero = document.querySelector('.hero');
const previewSection = document.getElementById('preview');

if (headerCta && hero) {
    const transitionPoint = hero.offsetHeight / 3;

    const updateHeaderCtaVisibility = () => {
        headerCta.classList.toggle('scrolled', window.scrollY > transitionPoint);

        if (!previewSection) {
            headerCta.style.opacity = '1';
            headerCta.style.pointerEvents = 'auto';
            return;
        }

        const previewTop = previewSection.offsetTop - (headerCta.offsetHeight || 0);

        if (window.scrollY >= previewTop) {
            headerCta.style.opacity = '0';
            headerCta.style.pointerEvents = 'none';
        } else {
            headerCta.style.opacity = '1';
            headerCta.style.pointerEvents = 'auto';
        }
    };

    window.addEventListener('scroll', updateHeaderCtaVisibility);
    window.addEventListener('resize', updateHeaderCtaVisibility);
    updateHeaderCtaVisibility();
}

// Toggle Button Functionality for Pricing
const pricingPanels = document.querySelectorAll('[data-pricing-panel]');

document.querySelectorAll('.option-button').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        const targetSection = document.getElementById(targetId);
        if (!targetSection) {
            return;
        }

        document.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        pricingPanels.forEach(panel => {
            panel.hidden = panel !== targetSection;
        });
    });
});

// Card data
const cardsData = [
    { title: "Cardiology", topics: "17 topics, 8 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Pulmonology", topics: "19 topics, 8 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Nephrology", topics: "18 topics, 9 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Gastro/Hepatology", topics: "25 topics, 12 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Infectious Disease", topics: "24 topics, 13 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Endocrinology", topics: "25 topics, 12 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Hematology", topics: "21 topics, 12 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Oncology", topics: "16 topics, 7 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Rheumatology", topics: "14 topics, 8 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "Neurology", topics: "16 topics, 8 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },
    { title: "General Internal Medicine", topics: "59 topics, 19 pages", date: "Up to date as of 09/2025", pdf: "assets/preview.pdf" },

];

// Function to create a card
function createCard(data) {
    const card = document.createElement("div");
    card.classList.add("carousel-card");
    card.innerHTML = `
        <div class="card-content">
            <h3>${data.title}</h3>
            <p><strong>${data.topics}</strong></p>
            <p>${data.date}</p>
            <div class="download-sample">
                <img src="assets/thumbnail.png" alt="Sample Topic" class="file-thumbnail"> 
                <span>Preview</span>
            </div>
        </div>
    `;

    // Add event listener to the entire "download-sample" div
    const downloadSample = card.querySelector(".download-sample");
    downloadSample.addEventListener("click", () => {
        const modal = document.getElementById("pdfModal");
        modal.querySelector("#pdfViewer").src = data.pdf;
        modal.querySelector("#pdfDownload").href = data.pdf;
        modal.style.display = "flex";
    });

    return card;
}

// Initialize the carousel
function initCarousel() {
    const carouselTrack = document.querySelector(".carousel-track");
    const sliderIndicator = document.querySelector(".slider-indicator");

    cardsData.forEach(data => {
        const card = createCard(data);
        carouselTrack.appendChild(card);
        if (window.innerWidth <= 768) {
            const dot = document.createElement("span");
            dot.classList.add("dot");
            dot.addEventListener("click", () => carouselTrack.scrollLeft = card.offsetLeft);
            sliderIndicator.appendChild(dot);
        }
    });

    if (window.innerWidth > 768) {
        document.querySelectorAll(".carousel-card").forEach(card => {
            const clone = card.cloneNode(true);
            carouselTrack.appendChild(clone);
        });
    }

    if (window.innerWidth <= 768) {
        updateActiveDot();
        carouselTrack.addEventListener("scroll", updateActiveDot);
    }
}

function updateActiveDot() {
    const track = document.querySelector(".carousel-track");
    const dots = document.querySelectorAll(".slider-indicator .dot");
    const cardWidth = document.querySelector(".carousel-card").offsetWidth;
    let activeIndex = Math.round(track.scrollLeft / cardWidth);
    dots.forEach((dot, index) => dot.classList.toggle("active", index === activeIndex));
}

initCarousel();

// Modal functionality
const modalClose = document.getElementById("modalClose");
const pdfModal = document.getElementById("pdfModal");
if (modalClose && pdfModal) {
    modalClose.addEventListener("click", () => pdfModal.style.display = "none");
}

const contactModal = document.getElementById("contactModal");
const contactClose = document.getElementById("contactClose");
const contactTriggers = document.querySelectorAll('[data-contact-trigger]');
const contactForm = document.querySelector('.contact-form');
const contactFormStatus = contactForm ? contactForm.querySelector('[data-form-status]') : null;
const contactSubmitButton = contactForm ? contactForm.querySelector('.contact-submit') : null;

const focusFirstTrigger = () => {
    if (contactTriggers.length > 0) {
        contactTriggers[0].focus();
    }
};

const openContactModal = () => {
    if (!contactModal) return;
    contactModal.style.display = "flex";
    contactTriggers.forEach(trigger => trigger.setAttribute("aria-expanded", "true"));
    const firstField = contactForm ? contactForm.querySelector('input, textarea, select') : null;
    if (firstField) {
        firstField.focus();
    }
};

const closeContactModal = () => {
    if (!contactModal) return;
    contactModal.style.display = "none";
    contactTriggers.forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
    focusFirstTrigger();
};

if (contactTriggers.length && contactModal) {
    contactTriggers.forEach(trigger => {
        trigger.addEventListener("click", openContactModal);
        trigger.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " " || event.key === "Space") {
                event.preventDefault();
                openContactModal();
            }
        });
        trigger.setAttribute("tabindex", "0");
        trigger.setAttribute("role", "button");
        trigger.setAttribute("aria-controls", "contactModal");
        trigger.setAttribute("aria-expanded", "false");
    });
}

if (contactClose && contactModal) {
    contactClose.addEventListener("click", closeContactModal);
}

window.addEventListener("click", event => {
    if (pdfModal && event.target === pdfModal) {
        pdfModal.style.display = "none";
    }

    if (contactModal && event.target === contactModal) {
        closeContactModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        if (pdfModal && pdfModal.style.display === "flex") {
            pdfModal.style.display = "none";
        }
        if (contactModal && contactModal.style.display === "flex") {
            closeContactModal();
        }
    }
});

if (contactForm && contactSubmitButton) {
    contactForm.addEventListener('submit', async event => {
        event.preventDefault();

        if (contactFormStatus) {
            contactFormStatus.textContent = 'Sending...';
        }

        contactSubmitButton.disabled = true;

        try {
            const formData = new FormData(contactForm);
            const response = await fetch(contactForm.action, {
                method: 'POST',
                body: formData,
                headers: {
                    Accept: 'application/json'
                }
            });

            if (response.ok) {
                if (contactFormStatus) {
                    contactFormStatus.textContent = 'Thanks! We will get back to you soon.';
                }
                contactForm.reset();
                setTimeout(() => {
                    if (contactFormStatus) {
                        contactFormStatus.textContent = '';
                    }
                    closeContactModal();
                }, 1600);
            } else {
                const data = await response.json().catch(() => null);
                const errorMessage = data && data.error ? data.error : 'There was a problem sending your message.';
                if (contactFormStatus) {
                    contactFormStatus.textContent = errorMessage;
                }
            }
        } catch (error) {
            if (contactFormStatus) {
                contactFormStatus.textContent = 'Network error. Please try again in a moment.';
            }
        } finally {
            contactSubmitButton.disabled = false;
        }
    });
}

// Scroll-triggered animation for "Why Choose" features
const features = document.querySelectorAll('.why-choose .feature');
window.addEventListener('scroll', () => {
    features.forEach(feature => {
        const featurePosition = feature.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.3;
        if (featurePosition < screenPosition) {
            feature.classList.add('animate');
        }
    });
});
