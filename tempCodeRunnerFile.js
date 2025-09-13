        `SELECT bp.*, u.name AS passenger_name, u.phone AS passenger_phone
         FROM ride_boarding_points bp
         JOIN users u ON bp.passenger_id = u.user_id
         WHERE bp.ride_id = ?`,