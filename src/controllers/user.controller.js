import { User } from "../models/user.models.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import validator from "validator"
import { uploadToCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const generateAccessAndRefreshTokens = async (userid) => {
    try {
        const user = await User.findById(userid);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        //save refresh token in db as well 
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { refreshToken, accessToken };

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}


const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend 
    //validation 
    //check if user already exists with username/email 
    //check for images, check for avatar
    //upload to cloudinary, avatar,
    // create user object- create entry in db 
    // renove password and refresh token field from response
    // check for user creation and return response

    const { username, email, fullname, password } = req.body
    //validations
    if (
        [username, email, password, fullname].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");
    }
    if (!validator.isEmail(email)) {
        throw new ApiError(400, "Email is invalid")
    }
    //check if user exists
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    //check for avatar, we can take here req.files because multer does this for us it allows us to use req.files because we added a middleware
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }
    //images are checked now upload them to cloudinary
    const avatar = await uploadToCloudinary(avatarLocalPath);
    const coverImage = await uploadToCloudinary(coverImageLocalPath)
    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    //now create user entry in user model or db 
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    //check if user is created or not
    //now we dont have to send password or refresh token in response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while register")
    }
    return res.status(201).json(
        new ApiResponse(200, createdUser, "user created successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //check if email/username is correct or not 
    //find the user
    //password check 
    //generate access and refresh token 
    //send tokens in cookies 
    const { email, password, username } = req.body
    if (!username || !email) {
        throw new ApiError(400, "username or email is required")
    }
    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exists");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(401, "Incorrect Password")
    }
    const { refreshToken, accessToken } = await generateAccessAndRefreshTokens(user._id)
    //we also have to update the user because it doesnt had refresh token at that time
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    
    //cookies also require some options like if we add these options then the cookies will be only modifiable by server side only
    //it adds security front end cant change this
    const options={
        httpOnly:true,
        secure:true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken,options)
        .cookie("refreshToken", refreshToken,options)
        .json(
            new ApiResponse(200, {
                user: loggedInUser, accessToken, refreshToken
            }, "User loggedin successfully")
        )
        //here we are also sharing refreshtoken and access token because for the scenarios like the user saves these tokens in local storage or etc 

})
const logoutUser = asyncHandler(async (req,res)=>{
    
})
export { registerUser,loginUser }