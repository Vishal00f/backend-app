import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"

const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        //because header comes in this format Authorization: Bearer <token>
        const token = req.cookies.accessToken || req.header("Authorization").replace("Bearer", "");
        if (!token) {
            throw new ApiError(401, "Unauthorized access");
        }

        const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET);
        //_id is we defined in user.models
        const user = await User.findById(decodedToken._id).select("-password -refreshToken");
        if(!user){
            throw new ApiError(401,"Invalid access token")
        }
        req.user = user;
        next();
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid access token")
    }
})