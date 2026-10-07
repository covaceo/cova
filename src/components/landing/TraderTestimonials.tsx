import "../../styles/landingTestimonials.css";

type TraderReview = {name: string; quote: string; rating: number};
const avatars = ["/media/reviews/avatar-01-v2.webp", "/media/reviews/avatar-02-v2.webp", "/media/reviews/avatar-03-v2.webp"];

export function TraderTestimonials({reviews}: {reviews: readonly TraderReview[]}) {
  return (
    <div id="reviews" className="market-reaction-band cova-trader-reviews" data-testimonial-layout="editorial-stack">
      <div className="cova-trader-reviews-heading">
        <h2 id="cova-trader-reviews-title">What people are saying</h2>
      </div>
      <div className="market-reaction-strip cova-trader-reviews-stack" aria-labelledby="cova-trader-reviews-title">
        {reviews.map(({name, quote, rating}, index) => (
          <blockquote className="market-reaction-item cova-trader-review" key={name}>
            <p>“{quote}”</p>
            <footer>
              <span className="cova-trader-review-person">
                <img data-review-avatar={index + 1} src={avatars[index]} width={48} height={48} alt="" loading="lazy" decoding="async" draggable={false}/>
                <strong>{name}</strong>
              </span>
              <span className="market-reaction-rating" role="img" aria-label={`${rating} out of 5 stars`}>
                <span aria-hidden="true">{"★".repeat(rating)}</span>
                <small aria-hidden="true">{rating}/5</small>
              </span>
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
