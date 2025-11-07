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
const previewSlider = document.querySelector('#preview .carousel-container');

if (headerCta && hero) {
    const transitionPoint = hero.offsetHeight / 3;

    const updateHeaderCtaVisibility = () => {
        headerCta.classList.toggle('scrolled', window.scrollY > transitionPoint);

        if (!previewSlider) {
            headerCta.style.opacity = '1';
            headerCta.style.pointerEvents = 'auto';
            return;
        }

        const sliderRect = previewSlider.getBoundingClientRect();
        const sliderInFocus = sliderRect.top < window.innerHeight * 0.6 && sliderRect.bottom > window.innerHeight * 0.2;

        if (sliderInFocus) {
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
document.querySelectorAll('.option-button').forEach(button => {
    button.addEventListener('click', () => {
        const targetSection = document.getElementById(button.dataset.target);
        document.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('#doctors-section, #programs-section').forEach(section => section.style.display = 'none');
        targetSection.style.display = 'block';
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

const contactButton = document.getElementById("contactButton");
const contactModal = document.getElementById("contactModal");
const contactClose = document.getElementById("contactClose");

if (contactButton && contactModal) {
    contactButton.addEventListener("click", () => {
        contactModal.style.display = "flex";
    });
}

if (contactClose && contactModal) {
    contactClose.addEventListener("click", () => {
        contactModal.style.display = "none";
    });
}

window.addEventListener("click", event => {
    if (event.target === pdfModal) {
        pdfModal.style.display = "none";
    }

    if (event.target === contactModal) {
        contactModal.style.display = "none";
    }
});

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
